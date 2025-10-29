import React from 'react';

export default function Card({ className = "", children }) {
  const base = "bg-white rounded-lg shadow p-6";
  return <div className={`${base} ${className}`}>{children}</div>;
}