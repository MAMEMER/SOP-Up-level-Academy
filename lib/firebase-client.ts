"use client";

// Firebase client for the SOP site — used only to file bug/suggestion tickets into
// the shared `tickets` collection (same up-level-guild project + shape as the guild /
// deck / court apps), so every report lands in one triage queue. Config values are
// public by design (protected by Firestore rules), matching the guild web bundle.

import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAKxWv3FI7HrdrRlnJhsQbJ-97Pb_sdiOQ",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "up-level-guild.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "up-level-guild",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "up-level-guild.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "721710985300",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "721710985300:web:c51e13963373a6feadbdc1"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);
