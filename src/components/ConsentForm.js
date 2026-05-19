import React, { useState } from 'react';
import './ConsentForm.css';

/**
 * ConsentForm — Gönüllü Katılımcı Onam Formu (EK-2)
 * ===================================================
 * Etik Kurul Raporu EK-2'deki metni içerir.
 * Kullanıcı "Çalışmaya gönüllü olarak katılmayı kabul ediyorum"
 * kutusunu işaretlemeden devam edemez.
 *
 * Onaylandıktan sonra DemographicForm'a yönlendirir.
 */
const ConsentForm = ({ onAccept, onDecline }) => {
  const [accepted, setAccepted] = useState(false);

  const handleContinue = () => {
    if (!accepted) {
      alert('Devam etmek için onam kutusunu işaretlemelisiniz.');
      return;
    }
    onAccept({
      consentAccepted: true,
      consentTimestamp: new Date().toISOString()
    });
  };

  return (
    <div className="consent-container">
      <div className="consent-card">
        
        <div className="consent-header">
          <h1>Gönüllü Katılımcı Onam Formu</h1>
        </div>

        <div className="consent-body">
          
          <div className="consent-section">
            <p>Sayın Katılımcı,
              bir deneysel çalışmaya davet edilmektesiniz. Lütfen aşağıdaki 
              bilgileri dikkatlice okuyunuz. 
            </p>
          </div>

          <div className="consent-section">
            <h3>Çalışma Hakkında</h3>
            <p>
              Bu kullanıcı çalışması, <strong>Kocaeli Üniversitesi Mühendislik 
              Fakültesi Bilgisayar Mühendisliği</strong>'nde
              yürütülmekte olan araştırma projesi kapsamında 
              gerçekleştirilmektedir.
            </p>
            <p>
              Proje, <strong>Doç. Dr. Pınar Onay Durdu</strong> ve 
              <strong> Arş. Gör. Kübra Erat</strong>'ın danışmanlığında, 
              lisans öğrencileri Zeycan Aslan, Ecesu Yıldırım ve 
              Meryem Şeyma Gençer tarafından yürütülmektedir.
            </p>
          </div>

          <div className="consent-section">
            <h3>Çalışmanın Amacı</h3>
            <p>
              EEG sinyallerinden elde edilen veriler aracılığıyla kullanıcıların 
              bilişsel iş yükü seviyelerinin değerlendirilmesi ve bu verilerin 
              geliştirilen sınav sistemleri uygulaması kapsamında kullanımının 
              incelenmesidir.
            </p>
          </div>

          <div className="consent-section">
            <h3>Sizden İstenenler</h3>
            <p>Bu çalışma kapsamında sizden sırasıyla şu adımları gerçekleştirmeniz istenecektir:</p>
            <p>-Demografik Bilgi Anketini yanıtlamanız</p>
            <p>-EEG başlığının takılmasının ardından geliştirilen sınav sorularını çözmeniz</p>  
            <p>-Sınav esnasında farklı zorluktaki görevlerde NASA-TLX Zihinsel İş Yükü Anketini doldurmanız</p>
            <p>-Çalışma tamamlandıktan sonra sistemle olan deneyiminizi değerlendirmek üzere UEQ-S Kullanıcı Deneyimi Ölçeği'ni yanıtlamanız</p>  
            <p>Sınav sırasında bilişsel yük seviyeniz Emotiv EPOC X EEG başlığıaracılığıyla kaydedilecek ve analiz edilecektir.</p>
          </div>

          <div className="consent-section">
            <h3>Güvenlik ve Gizlilik</h3>
            <p>
              Çalışmada kullanılan Emotiv EPOC X EEG başlığı ve üzerindeki 
              EEG sensörlerinin <strong> sağlığınız üzerinde herhangi bir olumsuz etkisi 
              bulunmamaktadır.</strong> EEG başlığı yalnızca kafa derisi 
              yüzeyinden sinyal okuma prensibiyle çalışmakta olup, herhangi bir 
              elektriksel uyarı vermemektedir.
            </p>
            <p>
              Katılım tamamen gönüllülük esasına dayalıdır.
              Çalışmadan istediğiniz zaman neden göstermeden ayrılabilirsiniz. 
              Toplanan tüm veriler, bilimsel araştırma amaçlı kullanılacak ve 
              araştırma yayınlandığında da kimlik bilgilerinizin gizliliği 
              korunacaktır.
            </p>
          </div>

          <div className="consent-section">
            <p className="consent-thanks">
              Çalışmamıza katılım davetimizi kabul ederek katkıda bulunduğunuz 
              için teşekkür ederiz.
            </p>
          </div>

        </div>

        <div className="consent-footer">
          <label className="consent-checkbox-label">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="consent-checkbox"
            />
            <span className="consent-checkbox-text">
              Yukarıdaki bilgileri okudum ve anladım. 
              Çalışmaya gönüllü olarak katılmayı kabul ediyorum.
            </span>
          </label>

          <div className="consent-buttons">
            {onDecline && (
              <button 
                onClick={onDecline} 
                className="consent-button consent-button-decline"
              >
                Reddediyorum
              </button>
            )}
            <button 
              onClick={handleContinue}
              disabled={!accepted}
              className={`consent-button consent-button-accept ${!accepted ? 'disabled' : ''}`}
            >
              Devam Et →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ConsentForm;
