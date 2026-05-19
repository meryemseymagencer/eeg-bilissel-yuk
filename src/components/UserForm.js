import React, { useState } from 'react';
import './UserForm.css';

/**
 * UserForm — Demografik Bilgiler Anketi (EK-3)
 * ==============================================
 * Etik Kurul Raporu EK-3'teki sorular kullanılır.
 * 
 * Veriler ANONİM toplanır - ad/soyad istenmez.
 * Katılımcı ID (P01, P02, ...) otomatik veya manuel atanır.
 */
const UserForm = ({ onStart }) => {
  const [formData, setFormData] = useState({
    // Katılımcı kimliği (anonim ID)
    participantId: '',
    
    // Temel demografik
    age: '',
    gender: '',
    
    // EK-3'teki ek alanlar
    department: '',
    educationLevel: '',
    
    // Nörolojik rahatsızlık
    hasNeurologicalCondition: '',
    neurologicalConditionDetail: '',
    
    // EEG deneyimi
    hasEEGExperience: '',
    eegExperienceDetail: '',
    
    // Sınav simulasyonu deneyimi
    hasSimulationExperience: '',
    simulationExperienceDetail: ''
  });

  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validate = () => {
    const newErrors = {};
    
    // Katılımcı ID
    if (!formData.participantId.trim()) {
      newErrors.participantId = 'Katılımcı ID alanı zorunludur (örn: P01, P02)';
    }
    
    // Yaş
    if (!formData.age) {
      newErrors.age = 'Yaş alanı zorunludur';
    } else {
      const ageNum = parseInt(formData.age);
      if (ageNum < 18 || ageNum > 30) {
        newErrors.age = 'Yaş 18-30 arasında olmalıdır (çalışma kriteri)';
      }
    }
    
    // Cinsiyet
    if (!formData.gender) {
      newErrors.gender = 'Cinsiyet seçimi zorunludur';
    }
    
    // Bölüm
    if (!formData.department.trim()) {
      newErrors.department = 'Bölüm bilgisi zorunludur';
    }
    
    // Eğitim düzeyi
    if (!formData.educationLevel) {
      newErrors.educationLevel = 'Eğitim düzeyi seçimi zorunludur';
    }
    
    // Nörolojik rahatsızlık
    if (!formData.hasNeurologicalCondition) {
      newErrors.hasNeurologicalCondition = 'Bu alanı yanıtlamanız gerekiyor';
    } else if (formData.hasNeurologicalCondition === 'evet' && 
               !formData.neurologicalConditionDetail.trim()) {
      newErrors.neurologicalConditionDetail = 'Lütfen rahatsızlığı belirtiniz';
    }
    
    // EEG deneyimi
    if (!formData.hasEEGExperience) {
      newErrors.hasEEGExperience = 'Bu alanı yanıtlamanız gerekiyor';
    } else if (formData.hasEEGExperience === 'evet' && 
               !formData.eegExperienceDetail.trim()) {
      newErrors.eegExperienceDetail = 'Lütfen deneyiminizi açıklayınız';
    }
    
    // Simulasyon deneyimi
    if (!formData.hasSimulationExperience) {
      newErrors.hasSimulationExperience = 'Bu alanı yanıtlamanız gerekiyor';
    } else if (formData.hasSimulationExperience === 'evet' && 
               !formData.simulationExperienceDetail.trim()) {
      newErrors.simulationExperienceDetail = 'Lütfen deneyiminizi açıklayınız';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      // Veriyi temizle ve gönder
      onStart({
        participantId: formData.participantId.trim(),
        age: parseInt(formData.age),
        gender: formData.gender,
        department: formData.department.trim(),
        educationLevel: formData.educationLevel,
        hasNeurologicalCondition: formData.hasNeurologicalCondition === 'evet',
        neurologicalConditionDetail: formData.neurologicalConditionDetail.trim() || null,
        hasEEGExperience: formData.hasEEGExperience === 'evet',
        eegExperienceDetail: formData.eegExperienceDetail.trim() || null,
        hasSimulationExperience: formData.hasSimulationExperience === 'evet',
        simulationExperienceDetail: formData.simulationExperienceDetail.trim() || null,
        // Meta veri
        submittedAt: new Date().toISOString()
      });
    } else {
      // İlk hata olan alanın üstüne scroll et
      const firstErrorField = Object.keys(errors)[0];
      if (firstErrorField) {
        const element = document.getElementsByName(firstErrorField)[0];
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  };

  return (
    <div className="user-form-container">
      <div className="user-form-card">
        
        <div className="form-header">
          <h1 className="form-title">Demografik Bilgiler</h1>
          <p className="form-subtitle">
            Katılımcı özelliklerini belirlemek amacıyla aşağıdaki bilgileri 
            paylaşmanız gerekmektedir. Tüm bilgiler <strong>anonim</strong> olarak 
            işlenecektir.
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="user-form">
          
          {/* ============ KATILIMCI ID ============ */}
          <div className="form-section">    
            <div className="form-group">
              <label htmlFor="participantId">
                Katılımcı ID *
              </label>
              <input
                type="text"
                id="participantId"
                name="participantId"
                value={formData.participantId}
                onChange={handleChange}
                className={errors.participantId ? 'error' : ''}
                placeholder="Örn: P01"
                autoComplete="off"
              />
              {errors.participantId && <span className="error-message">{errors.participantId}</span>}
            </div>
          </div>

          {/* ============ TEMEL DEMOGRAFİK ============ */}
          <div className="form-section">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="age">Yaş *</label>
                <input
                  type="number"
                  id="age"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  className={errors.age ? 'error' : ''}
                  placeholder="18-30"
                  min="18"
                  max="30"
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
                      value="erkek"
                      checked={formData.gender === 'erkek'}
                      onChange={handleChange}
                    />
                    <span>Erkek</span>
                  </label>
                </div>
                {errors.gender && <span className="error-message">{errors.gender}</span>}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="department">Bölümünüz *</label>
              <input
                type="text"
                id="department"
                name="department"
                value={formData.department}
                onChange={handleChange}
                className={errors.department ? 'error' : ''}
                placeholder="Örn: Bilgisayar Mühendisliği"
              />
              {errors.department && <span className="error-message">{errors.department}</span>}
            </div>

            <div className="form-group">
              <label>Şu an öğrenci olduğunuz eğitim düzeyi *</label>
              <div className="radio-group radio-group-vertical">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="educationLevel"
                    value="lisans"
                    checked={formData.educationLevel === 'lisans'}
                    onChange={handleChange}
                  />
                  <span>Lisans</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="educationLevel"
                    value="yuksek_lisans"
                    checked={formData.educationLevel === 'yuksek_lisans'}
                    onChange={handleChange}
                  />
                  <span>Yüksek Lisans</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="educationLevel"
                    value="doktora"
                    checked={formData.educationLevel === 'doktora'}
                    onChange={handleChange}
                  />
                  <span>Doktora</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="educationLevel"
                    value="diger"
                    checked={formData.educationLevel === 'diger'}
                    onChange={handleChange}
                  />
                  <span>Diğer</span>
                </label>
              </div>
              
              {errors.educationLevel && <span className="error-message">{errors.educationLevel}</span>}
            </div>
          </div>

          {/* ============ SAĞLIK DURUMU ============ */}
          <div className="form-section">     
            <div className="form-group">
              <label>Herhangi bir nörolojik rahatsızlığınız var mı? *</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="hasNeurologicalCondition"
                    value="hayir"
                    checked={formData.hasNeurologicalCondition === 'hayir'}
                    onChange={handleChange}
                  />
                  <span>Hayır</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="hasNeurologicalCondition"
                    value="evet"
                    checked={formData.hasNeurologicalCondition === 'evet'}
                    onChange={handleChange}
                  />
                  <span>Evet</span>
                </label>
              </div>
              {errors.hasNeurologicalCondition && (
                <span className="error-message">{errors.hasNeurologicalCondition}</span>
              )}
            </div>

            {formData.hasNeurologicalCondition === 'evet' && (
              <div className="form-group form-group-detail">
                <label htmlFor="neurologicalConditionDetail">
                  Lütfen rahatsızlığınızı belirtiniz *
                </label>
                <textarea
                  id="neurologicalConditionDetail"
                  name="neurologicalConditionDetail"
                  value={formData.neurologicalConditionDetail}
                  onChange={handleChange}
                  className={errors.neurologicalConditionDetail ? 'error' : ''}
                  rows="3"
                />
                {errors.neurologicalConditionDetail && (
                  <span className="error-message">{errors.neurologicalConditionDetail}</span>
                )}
              </div>
            )}
          </div>

          {/* ============ DENEYİM ============ */}
          <div className="form-section">
           <div className="form-group">
              <label>
                Daha önce herhangi bir EEG (Neurosky, Emotiv EPOC X vb.) başlığı kullandınız mı? *
              </label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="hasEEGExperience"
                    value="hayir"
                    checked={formData.hasEEGExperience === 'hayir'}
                    onChange={handleChange}
                  />
                  <span>Hayır</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="hasEEGExperience"
                    value="evet"
                    checked={formData.hasEEGExperience === 'evet'}
                    onChange={handleChange}
                  />
                  <span>Evet</span>
                </label>
              </div>
              {errors.hasEEGExperience && (
                <span className="error-message">{errors.hasEEGExperience}</span>
              )}
            </div>

            {formData.hasEEGExperience === 'evet' && (
              <div className="form-group form-group-detail">
                <label htmlFor="eegExperienceDetail">
                  Hangi ekipmanı ve ne amaçla kullandığınızı açıklayınız *
                </label>
                <textarea
                  id="eegExperienceDetail"
                  name="eegExperienceDetail"
                  value={formData.eegExperienceDetail}
                  onChange={handleChange}
                  className={errors.eegExperienceDetail ? 'error' : ''}
                  rows="3"
                />
                {errors.eegExperienceDetail && (
                  <span className="error-message">{errors.eegExperienceDetail}</span>
                )}
              </div>
            )}

            <div className="form-group">
              <label>
                Daha önce böyle bir sınav simülasyonunda yer aldınız mı? *
              </label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="hasSimulationExperience"
                    value="hayir"
                    checked={formData.hasSimulationExperience === 'hayir'}
                    onChange={handleChange}
                  />
                  <span>Hayır</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="hasSimulationExperience"
                    value="evet"
                    checked={formData.hasSimulationExperience === 'evet'}
                    onChange={handleChange}
                  />
                  <span>Evet</span>
                </label>
              </div>
              {errors.hasSimulationExperience && (
                <span className="error-message">{errors.hasSimulationExperience}</span>
              )}
            </div>

            {formData.hasSimulationExperience === 'evet' && (
              <div className="form-group form-group-detail">
                <label htmlFor="simulationExperienceDetail">
                  Lütfen deneyiminizi açıklayınız *
                </label>
                <textarea
                  id="simulationExperienceDetail"
                  name="simulationExperienceDetail"
                  value={formData.simulationExperienceDetail}
                  onChange={handleChange}
                  className={errors.simulationExperienceDetail ? 'error' : ''}
                  rows="3"
                />
                {errors.simulationExperienceDetail && (
                  <span className="error-message">{errors.simulationExperienceDetail}</span>
                )}
              </div>
            )}
          </div>

          {/* ============ SUBMIT ============ */}
          <div className="form-actions">
            <button type="submit" className="submit-button">
              Sınava Başla
            </button>
            <p className="form-footer-note">
              * işaretli alanlar zorunludur. 
            </p>
          </div>

        </form>
      </div>
    </div>
  );
};

export default UserForm;