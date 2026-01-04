import React, { useState, useEffect } from 'react';
import { gql } from '@apollo/client';
import { useQuery, useMutation, useApolloClient } from '@apollo/client/react';
import './App.css'; // Importujemy style

// --- ZAPYTANIA GRAPHQL ---
const LOGIN = gql`
mutation Login($username: String!, $password: String!) {
  login(username: $username, password: $password) { token, role, username, error }
}`;
const REGISTER = gql`
mutation Register($username: String!, $password: String!) {
  register(username: $username, password: $password) { token, role, username, error }
}`;
const GET_DATA = gql`
query GetData {
  getMyPlants { _id, name, lastWatered, species { _id, name, wateringInterval, imageUrl, description, funFact, fertilizer, lightLevel } },
  getSpecies { _id, name, wateringInterval, imageUrl, description, funFact, fertilizer, lightLevel }
}`;
const ADD_PLANT = gql`
mutation AddPlant($name: String!, $speciesId: String!) {
  addPlant(name: $name, speciesId: $speciesId) { _id }
}`;
const WATER_PLANT = gql`
mutation WaterPlant($id: String!) {
  waterPlant(id: $id) { _id, lastWatered }
}`;
const DELETE_PLANT = gql`
mutation DeletePlant($id: String!) {
  deletePlant(id: $id)
}`;
const ADD_SPECIES = gql`
mutation AddSpecies($name: String!, $wateringInterval: Int!, $imageUrl: String!, $description: String!, $funFact: String!, $fertilizer: String!, $lightLevel: Int!) {
  addSpecies(name: $name, wateringInterval: $wateringInterval, imageUrl: $imageUrl, description: $description, funFact: $funFact, fertilizer: $fertilizer, lightLevel: $lightLevel) { _id }
}`;

function AppHeader({ isLogged, onLogout }) {
  const username = localStorage.getItem('username');
  const role = localStorage.getItem('role');

  return (
    <header className="app-header">
      <h1>🌱 PlantPal</h1>
      <nav>
        {isLogged ? (
          <>
            <span>
              Cześć, <strong>{username}</strong> ({role})
            </span>
            <button onClick={onLogout} className="logout-btn">
              Wyloguj
            </button>
          </>
        ) : (
          <span className="auth-hint">Zaloguj się lub załóż konto</span>
        )}
      </nav>
    </header>
  );
}


// --- 1. EKRAN LOGOWANIA ---
function Auth({ onLogin }) {
  const [isReg, setIsReg] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '' });
  const [err, setErr] = useState('');
  const [authFn] = useMutation(isReg ? REGISTER : LOGIN);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isReg && form.password !== form.confirmPassword) { setErr("Hasła nie są identyczne"); return; }
    try {
      const { data } = await authFn({ variables: form });
      const res = isReg ? data.register : data.login;
      if (res.error) setErr(res.error);
      else {
        localStorage.setItem('token', res.token);
        localStorage.setItem('role', res.role);
        localStorage.setItem('username', res.username);
        onLogin();
      }
    } catch (e) { setErr("Błąd połączenia z serwerem"); }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>{isReg ? 'Rejestracja' : 'Logowanie'}</h2>
        <input placeholder="Login" required value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
        <input type="password" placeholder="Hasło" required value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
        {isReg && <input type="password" placeholder="Powtórz hasło" required value={form.confirmPassword} onChange={e => setForm({...form, confirmPassword: e.target.value})} />}
        {err && <p className="error-msg">{err}</p>}
        <button type="submit" className="auth-btn">{isReg ? 'Załóż konto' : 'Zaloguj się'}</button>
        <p onClick={() => setIsReg(!isReg)} className="toggle-auth">{isReg ? 'Masz konto? Zaloguj się' : 'Nie masz konta? Zarejestruj się'}</p>
      </form>
    </div>
  );
}

// --- 2. KOMPONENTY POMOCNICZE ---
function RatingIcons({ level, max = 5, icon, color }) {
  return (
    <div>
      {Array.from({ length: max }, (_, i) => {
        // Sprawdzamy, czy ta konkretna kropelka ma być aktywna
        const isActive = i + 1 <= level;
        
        return (
          <span 
            key={i} 
            style={{ 
              // Jeśli aktywna -> pełny kolor. Jeśli nie -> czarno-biała i półprzezroczysta
              filter: isActive ? 'none' : 'grayscale(100%) opacity(0.7)',
              // Zachowujemy kolor dla czcionek, ale dla emoji kluczowy jest filtr wyżej
              color: isActive ? color : '#e0e0e0', 
              fontSize: '1.5rem', 
              marginRight: '5px',
              transition: 'filter 0.3s ease' // Dodajemy ładne przejście
            }}
          >
            {icon}
          </span>
        );
      })}
    </div>
  );
}

function PlantModal({ plant, onClose }) {
  if (!plant) return null;
  const s = plant.species;

  const days = Number(s?.wateringInterval) || 7;

  let waterLevel; 

  if (days <= 3) waterLevel = 5;
  else if (days <= 6) waterLevel = 4;
  else if (days <= 13) waterLevel = 3;
  else if (days <= 21) waterLevel = 2;
  else waterLevel = 1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="close-modal-btn">×</button>
        <img src={s?.imageUrl || 'public/images/default.jpg'} alt="Plant" className="modal-img" onError={(e) => {e.currentTarget.src = "/images/default.jpg";}}/>
        <div className="modal-body">
          <h2>{s?.name}</h2>
          <h3>Twoja roślina: {plant.name}</h3>
          <div className="modal-stats">
            <div className="stat-box">
              <div className="stat-label">Światło</div>
              <RatingIcons level={s?.lightLevel || 3} max={5} icon="☀️" color="#fbc02d" />
              <small>Poziom {s?.lightLevel}/5</small>
            </div>
            <div className="stat-box">
              <div className="stat-label">Woda</div>
              <RatingIcons level={waterLevel} max={5} icon="💧" color="#039be5" />
              <small>Co {days} dni</small>
            </div>
          </div>
          <div>
            <h4 className="section-title">📖 Opis</h4>
            <p>{s?.description}</p>
          </div>
          <div>
            <h4 className="section-title">🧪 Odżywka</h4>
            <p>💊 {s?.fertilizer}</p>
          </div>
          <div className="fun-fact-box">
            <h4>✨ Ciekawostka</h4>
            "{s?.funFact}"
          </div>
          <button onClick={onClose} className="submit-btn">Zamknij</button>
        </div>
      </div>
    </div>
  );
}

function PlantCard({ plant, refetch, onOpen }) {
  // console.log("[LOG] Plant:", plant.name, "Image URL:", plant.species?.imageUrl);
  // console.log("[LOG] Plant:", plant.name, "Interval:", plant.species?.wateringInterval);


  const [water, { loading }] = useMutation(WATER_PLANT, { onCompleted: () => refetch(), onError: (err) => alert("Błąd: " + err.message) });
  const [del] = useMutation(DELETE_PLANT, { onCompleted: refetch });

  const today = new Date(); today.setHours(0,0,0,0);
  let isValidDate = !!plant.lastWatered;
  let lastDate = isValidDate ? new Date(plant.lastWatered) : null;
  if (lastDate && !isNaN(lastDate.getTime())) lastDate.setHours(0,0,0,0);
  else isValidDate = false;

  const interval = plant.species?.wateringInterval || 7;
  let daysLeft = 0;
  if (isValidDate) daysLeft = interval - Math.ceil((today - lastDate) / (1000 * 60 * 60 * 24));

  let statusText = isValidDate ? `Za ${daysLeft} dni` : "⚠️ Brak daty";
  let statusColor = "#1976d2";
  let isOverdue = false;
  if (!isValidDate) { statusColor = "#757575"; isOverdue = true; }
  else if (daysLeft < 0) { isOverdue = true; statusText = `Spóźnione ${Math.abs(daysLeft)} dni!`; statusColor = "#d32f2f"; }
  else if (daysLeft === 0) { statusText = "Podlej dzisiaj"; statusColor = "#f57c00"; }

  return (
    <article className="plant-card" onClick={onOpen}>
      <img src={plant.species?.imageUrl || "/images/default.jpg"} alt={plant.name} className="plant-img" onError={(e) => {e.currentTarget.src = "/images/default.jpg"; }}/>
      <div className="plant-info">
        <div className="plant-header">
          <h3>{plant.name}</h3>
          <span className="species-badge">{plant.species?.name}</span>
        </div>
        <div className="status-text" style={{color: statusColor}}>{statusText}</div>
        <div className="interval-info">Interwał: {interval} dni</div>
        <div className="card-actions">
          <button className="btn-water" disabled={loading} onClick={e => { e.stopPropagation(); water({ variables: { id: plant._id } }); }}>
            {loading ? '...' : '💧 Podlej'}
          </button>
          <button className="btn-delete" onClick={e => { e.stopPropagation(); if(window.confirm("Usunąć?")) del({ variables: { id: plant._id } }); }}>
            Usuń
          </button>
        </div>
      </div>
    </article>
  );
}

// --- 3. DASHBOARD ---
function Dashboard({ onLogout }) {
  const { data, loading, error, refetch } = useQuery(GET_DATA, { notifyOnNetworkStatusChange: true });
  const role = localStorage.getItem('role');
  const username = localStorage.getItem('username');

  const [selectedPlant, setSelectedPlant] = useState(null);
  const [newPlant, setNewPlant] = useState({ name: '', speciesId: '' });
  const [newSpecies, setNewSpecies] = useState({ name: '', wateringInterval: 7, imageUrl: '', description: '', funFact: '', fertilizer: '', lightLevel: 3 });

  const [addPlant] = useMutation(ADD_PLANT, { onCompleted: () => { refetch(); setNewPlant({name:'', speciesId:''}); }});
  const [addSpecies] = useMutation(ADD_SPECIES, { onCompleted: () => { refetch(); setNewSpecies({name:'', wateringInterval:7, imageUrl:'', description: '', funFact: '', fertilizer: '', lightLevel: 3}); alert('Gatunek dodany!'); }});

  if (loading && !data) return <p>Ładowanie dżungli...</p>;
  if (error) return <p>Błąd: {error.message}</p>;

  return (
    <>
      {selectedPlant && <PlantModal plant={selectedPlant} onClose={() => setSelectedPlant(null)} />}
      <main>
        {role === 'ADMIN' && (
          <section className="panel">
            <h2>👑 Panel Administratora: Dodaj Gatunek</h2>
            <form className="plant-form" onSubmit={e => { e.preventDefault(); addSpecies({variables: newSpecies}); }}>
              <div className="form-row">
                <div className="form-group">
                  <label>Nazwa</label>
                  <input required value={newSpecies.name} onChange={e => setNewSpecies({...newSpecies, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>URL Zdjęcia</label>
                  <input required value={newSpecies.imageUrl} onChange={e => setNewSpecies({...newSpecies, imageUrl: e.target.value})} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Dni (Woda)</label>
                  <input type="number" required value={newSpecies.wateringInterval} onChange={e => setNewSpecies({...newSpecies, wateringInterval: parseInt(e.target.value)})} />
                </div>
                <div className="form-group">
                  <label>Odżywka</label>
                  <input required value={newSpecies.fertilizer} onChange={e => setNewSpecies({...newSpecies, fertilizer: e.target.value})} />
                </div>
              </div>
              <div className="slider-group">
                <div className="slider-labels">Ilość światła: {newSpecies.lightLevel}/5</div>
                <input type="range" min="1" max="5" className="range-input" value={newSpecies.lightLevel} onChange={e => setNewSpecies({...newSpecies, lightLevel: parseInt(e.target.value)})} />
                <div className="slider-labels"><span>Cień</span><span>Półcień</span><span>Słońce</span></div>
              </div>
              <textarea placeholder="Opis..." rows="2" required value={newSpecies.description} onChange={e => setNewSpecies({...newSpecies, description: e.target.value})} />
              <textarea placeholder="Ciekawostka..." rows="2" required value={newSpecies.funFact} onChange={e => setNewSpecies({...newSpecies, funFact: e.target.value})} />
              <button type="submit" className="submit-btn">Dodaj Gatunek</button>
            </form>
          </section>
        )}

        <section className="panel">
          <h2>Dodaj nową roślinę</h2>
          <form className="plant-form" onSubmit={e => { e.preventDefault(); addPlant({variables: newPlant}); }}>
            <select required value={newPlant.speciesId} onChange={e => setNewPlant({...newPlant, speciesId: e.target.value})}>
              <option value="">-- Wybierz gatunek --</option>
              {data.getSpecies.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            <input placeholder="Nazwa Twojej rośliny" required value={newPlant.name} onChange={e => setNewPlant({...newPlant, name: e.target.value})} />
            <button type="submit" className="submit-btn">Dodaj</button>
          </form>
        </section>

        <section className="panel">
          <h2>Twoje Rośliny</h2>

          <div className="plant-grid">
          {data.getMyPlants.length === 0 ? (
            <p style={{ gridColumn: '1/-1', textAlign: 'center' }}>Pusto tu. Dodaj coś!</p>
          ) : (
            data.getMyPlants.map((p) => (
              <PlantCard 
                key={p._id} 
                plant={p} 
                refetch={refetch} 
                onOpen={() => setSelectedPlant(p)} 
              />
            ))
          )}
        </div>
        </section>
      </main>
    </>
  );
}


export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const client = useApolloClient();

  useEffect(() => {
    if (!token) return; // jeśli nie ma tokena, nic nie robimy

    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = payload.exp - now;

    if (expiresIn <= 0) {
      localStorage.clear();
      setToken(null);
      return;
    }

    const timeout = setTimeout(() => {
      localStorage.clear();
      setToken(null);
      alert("Twój token wygasł. Zaloguj się ponownie.");
    }, expiresIn * 1000);

    return () => clearTimeout(timeout);
  }, [token]);


  const logout = async () => { await client.clearStore(); localStorage.clear(); setToken(null); };
 return (
    <>
      <AppHeader isLogged={!!token} onLogout={logout} />
      {token ? (
        <Dashboard onLogout={logout} />
      ) : (
        <Auth onLogin={() => setToken(localStorage.getItem('token'))} />
      )}
    </>
  );
}
