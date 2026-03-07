import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDaoXoscYFKLRYrfNi8EHaH0X0Y-J7SuAY",
  authDomain: "tefex-trading.firebaseapp.com",
  projectId: "tefex-trading",
  storageBucket: "tefex-trading.firebasestorage.app",
  messagingSenderId: "218753285981",
  appId: "1:218753285981:web:c940d2d847bb844a1db2b4"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
