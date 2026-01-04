import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { ApolloClient, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { createHttpLink } from '@apollo/client/link/http'
import { setContext } from '@apollo/client/link/context'
// Adres Twojego serwera Python
const httpLink = createHttpLink({
  uri: 'http://127.0.0.1:5000/graphql',
});

// Dodawanie tokena do każdego zapytania (Autoryzacja)
const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    }
  }
});

// Konfiguracja klienta
const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ApolloProvider client={client}>
      <App />
    </ApolloProvider>
  </React.StrictMode>,
)