from flask import Flask, request, jsonify, render_template
from ariadne import load_schema_from_path, make_executable_schema, graphql_sync, snake_case_fallback_resolvers, ObjectType
from flask_cors import CORS
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime, timedelta, timezone
import jwt
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app)

# --- KONFIGURACJA BAZY I SECRET ---
MONGO_URI = os.getenv("MONGO_URI")
SECRET_KEY = os.getenv("JWT_SECRET")

client = MongoClient(MONGO_URI)
db = client.get_database("PlantPalDB")


try:
    print("⏳ Próba połączenia z bazą...")
    client.admin.command('ping')
    print("✅ SUKCES! Baza działa.")
except Exception as e:
    print("❌ BŁĄD! Nie można połączyć się z bazą.")
    print(f"Powód: {e}")
    exit(1)

# --- DEFINICJA TYPÓW ---
query = ObjectType("Query")
mutation = ObjectType("Mutation")
plant_type = ObjectType("Plant")

# --- FUNKCJE POMOCNICZE ---
def check_auth(request):
    token = request.headers.get("Authorization")
    if not token:
        return None
    try:
        clean_token = token.split(" ")[1] if " " in token else token
        return jwt.decode(clean_token, SECRET_KEY, algorithms=["HS256"])
    except:
        return None

# --- RESOLVERY AUTH ---
@mutation.field("register")
def resolve_register(_, info, username, password):
    if db.users.find_one({"username": username}):
        return {"error": "Nazwa użytkownika jest już zajęta"}
    role = "ADMIN" if db.users.count_documents({}) == 0 else "USER"
    hashed = generate_password_hash(password)
    uid = db.users.insert_one({"username": username, "password": hashed, "role": role}).inserted_id
    expire_date = datetime.now(timezone.utc) + timedelta(hours=1)
    token = jwt.encode({"user_id": str(uid), "role": role, "exp": int(expire_date.timestamp())}, SECRET_KEY, algorithm="HS256")
    return {"token": token, "role": role, "username": username, "error": ""}

@mutation.field("login")
def resolve_login(_, info, username, password):
    u = db.users.find_one({"username": username})
    if not u or not check_password_hash(u["password"], password):
        return {"error": "Hasło lub login są błędne", "token": None, "role": None}
    expire_date = datetime.now(timezone.utc) + timedelta(hours=1)
    token = jwt.encode({"user_id": str(u["_id"]), "role": u["role"], "exp": int(expire_date.timestamp())}, SECRET_KEY, algorithm="HS256")
    return {"token": token, "role": u["role"], "username": u["username"], "error": ""}

# --- RESOLVERY QUERY ---
@query.field("getSpecies")
def resolve_get_species(_, info):
    species_list = list(db.species.find())
    result = []
    for s in species_list:
        result.append({
            "_id": str(s["_id"]),
            "name": s.get("name") or "",
            "wateringInterval": s.get("wateringInterval") or 0,
            "imageUrl": s.get("imageUrl") or "",
            "description": s.get("description") or "Brak opisu.",
            "funFact": s.get("funFact") or "Brak ciekawostek.",
            "fertilizer": s.get("fertilizer") or "Uniwersalna",
            "lightLevel": s.get("lightLevel") or 3
        })
    return result

@query.field("getMyPlants")
def resolve_get_my_plants(_, info):
    print("\n🔵 --- DEBUG START: getMyPlants ---") # 1. Wiemy, że funkcja ruszyła

    auth = check_auth(info.context)
    if not auth:
        print("❌ Brak autoryzacji (tokenu)")
        return []
    
    # Pobieramy rośliny z bazy
    plants = list(db.plants.find({"user_id": auth["user_id"]}))
    print(plants)
    # for p in plants:
        # 1. Konwersja ID
        # p["_id"] = str(p["_id"])
        
        # 2. Mapowanie camelCase (baza) -> snake_case (Ariadne)
        # Ariadne szuka p['last_watered'], a w bazie  p['lastWatered']
        # if "lastWatered" in p:
        #     p["last_watered"] = p["lastWatered"]
        # else:
        #     # Opcjonalnie: jeśli roślina jest nowa i nie ma daty, ustaw None
        #     p["lastWatered"] = None
            
    return plants

# --- RESOLVERY PLANT ---
@plant_type.field("species")
def resolve_plant_species(obj, info):
    
    sid = obj.get("speciesId")
    
    if not sid:
        return None

    try:
        # Upewniamy się, że szukamy po ObjectId w MongoDB
        s = db.species.find_one({"_id": ObjectId(sid)})
    except Exception as e:
        return None

    if not s:
        return None

    # Mapowanie jawne, aby Apollo dostawał czyste typy Python -> JSON
    species_obj = {
        "_id": str(s["_id"]),
        "name": str(s.get("name", "")),
        "wateringInterval": int(s.get("wateringInterval", 0)),
        "imageUrl": str(s.get("imageUrl", "")),
        
        "description": str(s.get("description", "Brak opisu.")),
        "funFact": str(s.get("funFact", "Brak ciekawostek.")),
        "fertilizer": str(s.get("fertilizer", "Uniwersalna")),
        "lightLevel": int(s.get("lightLevel", 3)) # Domyślnie 3 (średnio)
    }

    # # --- DEBUG ---
    # print("--------------------------------------------------")
    # print(f"DEBUG species dla rośliny {obj.get('name')}:")
    # print(species_obj) # To wypisze słownik w terminalu
    # print("--------------------------------------------------")
    # # --- DODAJ PRINT PO MAPOWANIU ---
    # print("MAPPED species_obj (dla GraphQL):", species_obj)
    # # --- KONIEC DEBUG ---
    
    return species_obj


# --- RESOLVERY MUTATION ---
@mutation.field("addSpecies")
def resolve_add_species(_, info, name, wateringInterval, imageUrl, description, funFact, fertilizer, lightLevel):
    auth = check_auth(info.context)
    if not auth or auth["role"] != "ADMIN":
        raise Exception("Admin only")
    new = {
        "name": name, 
        "wateringInterval": wateringInterval, 
        "imageUrl": imageUrl,
        "description": description,
        "funFact": funFact,       
        "fertilizer": fertilizer, 
        "lightLevel": lightLevel  
    }
    res = db.species.insert_one(new)
    new["_id"] = str(res.inserted_id)
    return new

@mutation.field("deleteSpecies")
def resolve_delete_species(_, info, id):
    auth = check_auth(info.context)
    if not auth or auth["role"] != "ADMIN":
        raise Exception("Admin only")
    # Blokada jeśli gatunek jest używany
    if db.plants.count_documents({"speciesId": id}) > 0:
        raise Exception("Nie można usunąć gatunku używanego przez rośliny")
    db.species.delete_one({"_id": ObjectId(id)})
    return True

@mutation.field("addPlant")
def resolve_add_plant(_, info, name, speciesId):
    auth = check_auth(info.context)
    if not auth:
        raise Exception("Login required")
    if not db.species.find_one({"_id": ObjectId(speciesId)}):
        raise Exception("Nie znaleziono gatunku")
    new = {
        "user_id": auth["user_id"],
        "name": name,
       "speciesId": ObjectId(speciesId),
        "lastWatered": datetime.now().isoformat()
    }
    res = db.plants.insert_one(new)
    new["_id"] = str(res.inserted_id)
    return new

@mutation.field("waterPlant")
def resolve_water_plant(_, info, id):
    auth = check_auth(info.context)
    if not auth:
        raise Exception("Login required")
    
    # 1. Aktualizujemy datę
    db.plants.update_one(
        {"_id": ObjectId(id), "user_id": auth["user_id"]},
        {"$set": {"lastWatered": datetime.now().isoformat()}}
    )
    
    # 2. Pobieramy zaktualizowaną roślinę
    plant = db.plants.find_one({"_id": ObjectId(id)})
    
    # Zabezpieczenie: jeśli roślina nie istnieje (np. ktoś ją usunął w międzyczasie)
    if not plant:
        raise Exception("Plant not found")

    # 3. NAPRAWIAMY TYPY DLA GRAPHQL
    plant["_id"] = str(plant["_id"])
    
    # KLUCZOWY MOMENT: Tłumaczymy camelCase z bazy na snake_case dla Ariadne
    if "lastWatered" in plant:
        plant["last_watered"] = plant["lastWatered"]
        
    return plant

@mutation.field("deletePlant")
def resolve_delete_plant(_, info, id):
    auth = check_auth(info.context)
    if not auth:
        return False
    res = db.plants.delete_one({"_id": ObjectId(id), "user_id": auth["user_id"]})
    return res.deleted_count > 0

# --- SCHEMA I SERWER ---
type_defs = load_schema_from_path("schema.graphql")
schema = make_executable_schema(type_defs, query, mutation, plant_type)


@app.route("/graphql", methods=["GET"])
def graphql_playground():
    return render_template("sandbox.html"), 200

@app.route("/graphql", methods=["POST"])
def graphql_server():
    data = request.get_json()
    success, result = graphql_sync(schema, data, context_value=request, debug=True)
    return jsonify(result), 200 if success else 400

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False, port=5000)
    