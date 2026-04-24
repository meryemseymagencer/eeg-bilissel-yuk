// Bilişsel yük odaklı soru veritabanı (Çalışma belleği + n-back uyumlu)

export const questions = {
  kolay: [
    // KATEGORİ A – Sayısal İşlem
    {
      id: 1,
      question: "6 + 3 = ?",
      options: ["7", "8", "9", "10"],
      correctAnswer: 2,
      points: 10,
      category: "A"
    },
    {
      id: 2,
      question: "9 + 4 = ?",
      options: ["11", "12", "13", "14"],
      correctAnswer: 2,
      points: 10,
      category: "A"
    },

    // KATEGORİ B – Kategorik Karşılaştırma
    {
      id: 3,
      question: "Kalem – Defter – Kitap – Muz\nHangisi farklıdır?",
      options: ["Kalem", "Defter", "Kitap", "Muz"],
      correctAnswer: 3,
      points: 10,
      category: "B"
    },

    // KATEGORİ D – Hafıza (0-back benzeri)
    {
      id: 4,
      question: "Ekranda gösterilen sayılar: 4 – 7 – 2\nSayıları aynı sırayla seçiniz.",
      options: ["4 – 7 – 2", "2 – 7 – 4", "7 – 4 – 2", "4 – 2 – 7"],
      correctAnswer: 0,
      points: 10,
      category: "D"
    }
  ],

  orta: [
    // KATEGORİ A – Sayısal İşlem
    {
      id: 5,
      question: "52 − 7 = ?",
      options: ["43", "44", "45", "46"],
      correctAnswer: 2,
      points: 20,
      category: "A"
    },

    // KATEGORİ B – Yakın Kategoriler
    {
      id: 6,
      question: "Kedi – Köpek – Aslan – Tavuk\nHangisi evcil hayvan değildir?",
      options: ["Kedi", "Köpek", "Aslan", "Tavuk"],
      correctAnswer: 2,
      points: 20,
      category: "B"
    },

    // KATEGORİ C – Denklem
    {
      id: 7,
      question: "2X − 6 = 10 ise X = ?",
      options: ["6", "7", "8", "9"],
      correctAnswer: 2,
      points: 20,
      category: "C"
    },

    // KATEGORİ D – Ters Sıra (1-back benzeri)
    {
      id: 8,
      question: "Gösterilen sayılar: 3 – 8 – 5 – 1 – 6\nSayıları ters sırayla seçiniz.",
      options: [
        "1 – 6 – 5 – 8 – 3",
        "3 – 8 – 5 – 1 – 6",
        "6 – 5 – 1 – 8 – 3",
        "6 – 1 – 5 – 8 – 3"
      ],
      correctAnswer: 3,
      points: 20,
      category: "D"
    }
  ],

  zor: [
    // KATEGORİ A – Çoklu İşlem
    {
      id: 9,
      question: "28 + 14 − 6 = ?",
      options: ["34", "36", "38", "40"],
      correctAnswer: 1,
      points: 30,
      category: "A"
    },

    // KATEGORİ B – Soyut / Çeldirici
    {
      id: 10,
      question: "Uçak – Arı – Yusufcuk – Kuş\nHangisi canlı değildir?",
      options: ["Uçak", "Arı", "Yusufcuk", "Kuş"],
      correctAnswer: 0,
      points: 30,
      category: "B"
    },

    // KATEGORİ C – İki Değişkenli Denklem
    {
      id: 11,
      question: "X + Y = 12 ve X − Y = 4 ise X = ?",
      options: ["6", "7", "8", "9"],
      correctAnswer: 2,
      points: 30,
      category: "C"
    },

    // KATEGORİ D – Güncelleme + Karar (n-back benzeri)
    {
      id: 12,
      question:
        "Aşağıdaki sayı gruplarının toplamı çift midir?\n(4 – 5 – 3)",
      options: ["Çift", "Tek"],
      correctAnswer: 0,
      points: 30,
      category: "D"
    }
  ]
};

// Zorluk seviyesine göre süre saniye cinsinden (kolay: 15sn, orta: 25sn, zor: 40sn)
export const timeByDifficulty = {
  kolay: 15,
  orta: 25,
  zor: 40
};

// Zorluk seviyesi sırası
export const difficultyOrder = ['kolay', 'orta', 'zor'];

