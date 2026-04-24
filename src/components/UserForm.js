import React, { useState } from 'react';
import './UserForm.css';

const UserForm = ({ onStart }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    age: '',
    gender: ''
  });

  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validate = () => {
    const newErrors = {};
    
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Ad alanı zorunludur';
    }
    
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Soyad alanı zorunludur';
    }
    
    if (!formData.age) {
      newErrors.age = 'Yaş alanı zorunludur';
    } else if (parseInt(formData.age) < 1 || parseInt(formData.age) > 150) {
      newErrors.age = 'Geçerli bir yaş giriniz (1-150)';
    }
    
    if (!formData.gender) {
      newErrors.gender = 'Cinsiyet seçimi zorunludur';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onStart({
        ...formData,
        age: parseInt(formData.age)
      });
    }
  };

  return (
    <div className="user-form-container">
      <div className="user-form-card">
        <h1 className="form-title">Sınav Simülasyonu</h1>
        <p className="form-subtitle">Başlamak için lütfen bilgilerinizi giriniz</p>
        
        <form onSubmit={handleSubmit} className="user-form">
          <div className="form-group">
            <label htmlFor="firstName">Ad *</label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              className={errors.firstName ? 'error' : ''}
              placeholder="Adınızı giriniz"
            />
            {errors.firstName && <span className="error-message">{errors.firstName}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="lastName">Soyad *</label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              className={errors.lastName ? 'error' : ''}
              placeholder="Soyadınızı giriniz"
            />
            {errors.lastName && <span className="error-message">{errors.lastName}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="age">Yaş *</label>
            <input
              type="number"
              id="age"
              name="age"
              value={formData.age}
              onChange={handleChange}
              className={errors.age ? 'error' : ''}
              placeholder="Yaşınızı giriniz"
              min="1"
              max="150"
            />
            {errors.age && <span className="error-message">{errors.age}</span>}
          </div>

          <div className="form-group">
            <label>Cinsiyet *</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="gender"
                  value="erkek"
                  checked={formData.gender === 'erkek'}
                  onChange={handleChange}
                />
                <span>Erkek</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="gender"
                  value="kadın"
                  checked={formData.gender === 'kadın'}
                  onChange={handleChange}
                />
                <span>Kadın</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="gender"
                  value="belirtmek istemiyorum"
                  checked={formData.gender === 'belirtmek istemiyorum'}
                  onChange={handleChange}
                />
                <span>Belirtmek istemiyorum</span>
              </label>
            </div>
            {errors.gender && <span className="error-message">{errors.gender}</span>}
          </div>

          <button type="submit" className="submit-button">
            Sınava Başla
          </button>
        </form>
      </div>
    </div>
  );
};

export default UserForm;

