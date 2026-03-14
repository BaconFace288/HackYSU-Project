import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD6RRvWJfmJWTbfZQP91t5EwFF0B7eb-7A",
  authDomain: "healspace-e235d.firebaseapp.com",
  projectId: "healspace-e235d",
  storageBucket: "healspace-e235d.firebasestorage.app",
  messagingSenderId: "611042693089",
  appId: "1:611042693089:web:555e292389718adc634ca0",
  measurementId: "G-RJLS1XE2S5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth and Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);
