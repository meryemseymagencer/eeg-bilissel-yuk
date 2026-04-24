import React, { useState } from 'react';
import './NasaTLX.css';

const scales = [
  { key: 'mental', label: 'Zihinsel Talep' },
  { key: 'physical', label: 'Fiziksel Talep' },
  { key: 'temporal', label: 'Zamansal Talep' },
  { key: 'effort', label: 'Efor' },
  { key: 'performance', label: 'Performans' },
  { key: 'frustration', label: 'Rahatsızlık Seviyesi' }
];

const difficultyLabel = { kolay: 'Kolay', orta: 'Orta', zor: 'Zor' };

const NasaTLX = ({ difficulty, onSubmit }) => {
  const [values, setValues] = useState({});

  const handleChange = (key, value) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    if (Object.keys(values).length !== scales.length) {
      alert('Lütfen tüm alanları doldurun');
      return;
    }
    onSubmit(values);
  };

  return (
    <div className="nasa-container">
      <h2>NASA-TLX Zihinsel İş Yükü Anketi</h2>
      {difficulty && (
        <p className="nasa-difficulty-label">{difficultyLabel[difficulty]} Seviye</p>
      )}

      {scales.map(scale => (
        <div key={scale.key} className="nasa-item">
          <label>{scale.label}</label>
          <input
            type="range"
            min="0"
            max="20"
            value={values[scale.key] || 0}
            onChange={e => handleChange(scale.key, Number(e.target.value))}
          />
          <span>{values[scale.key] || 0}</span>
        </div>
      ))}

      <button onClick={handleSubmit}>Devam Et</button>
    </div>
  );
};

export default NasaTLX;
