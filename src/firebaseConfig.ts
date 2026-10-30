// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Add your Firebase project's configuration here
const firebaseConfig = {
  apiKey: "AIzaSyB9MHSdDixCSoAKqTImnAdJO63TzRnY2pE",
  authDomain: "inventra-aba43.firebaseapp.com",
  projectId: "inventra-aba43",
  storageBucket: "inventra-aba43.firebasestorage.app",
  messagingSenderId: "1052982287451",
  appId: "1:1052982287451:web:e87936f1ad1afa6ffd337e"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get a Firestore instance
export const db = getFirestore(app);