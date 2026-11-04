// firebase-config.js — ค่าของร้านนี้ร้านเดียว (1 ร้าน = 1 โปรเจกต์ Firebase)
// ย้ายร้าน/เปลี่ยนโปรเจกต์: แก้แค่ไฟล์นี้ไฟล์เดียว
//
// วิธีเอาค่า: Firebase console > Project settings > General > Your apps > Web app > SDK setup and configuration > Config
// ถ้ายังไม่ได้ใส่ค่า (apiKey ยังขึ้นต้นด้วย "ใส่") แอปจะเปิดเป็น "โหมดทดลอง" เก็บข้อมูลในเครื่องนี้เท่านั้น
// หมายเหตุ: apiKey ของเว็บแอป Firebase ไม่ใช่ความลับ (เปิดดูได้จากหน้าเว็บอยู่แล้ว) ความปลอดภัยอยู่ที่ firestore.rules

export const firebaseConfig = {
  apiKey: 'AIzaSyAIEuXVvQ0WIcW3BvuxqVrZJGCXTaIP5Hc',
  authDomain: 'school-shop-25ef3.firebaseapp.com',
  projectId: 'school-shop-25ef3',
  storageBucket: 'school-shop-25ef3.firebasestorage.app',
  messagingSenderId: '239038323960',
  appId: '1:239038323960:web:13fb410a048f718a5bef0d',
};
