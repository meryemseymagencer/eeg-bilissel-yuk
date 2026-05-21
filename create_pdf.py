# -*- coding: utf-8 -*-
"""
EEG Bilişsel Yük Çalışması — Soru Kataloğu PDF Oluşturucu
Kocaeli Üniversitesi | Etik Kurul Onaylı Protokol
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY

# ─────────────────────────────────────────────────────────
# 1. FONT KAYIT — Windows sistem fontları (Türkçe karakter desteği)
# ─────────────────────────────────────────────────────────
FONT_DIR = r"C:\Windows\Fonts"

def register_fonts():
    try:
        pdfmetrics.registerFont(TTFont("Arial",       os.path.join(FONT_DIR, "arial.ttf")))
        pdfmetrics.registerFont(TTFont("Arial-Bold",  os.path.join(FONT_DIR, "arialbd.ttf")))
        pdfmetrics.registerFont(TTFont("Arial-Italic",os.path.join(FONT_DIR, "ariali.ttf")))
        return "Arial", "Arial-Bold", "Arial-Italic"
    except:
        try:
            pdfmetrics.registerFont(TTFont("Calibri",      os.path.join(FONT_DIR, "calibri.ttf")))
            pdfmetrics.registerFont(TTFont("Calibri-Bold",  os.path.join(FONT_DIR, "calibrib.ttf")))
            pdfmetrics.registerFont(TTFont("Calibri-Italic",os.path.join(FONT_DIR, "calibrii.ttf")))
            return "Calibri", "Calibri-Bold", "Calibri-Italic"
        except:
            return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"

FONT, FONT_BOLD, FONT_ITALIC = register_fonts()

# ─────────────────────────────────────────────────────────
# 2. SORU VERİTABANI
# ─────────────────────────────────────────────────────────

QUESTIONS = {

  # ════════════════════════════════════════════════════════════════════════════
  # KOLAY — Düşük bilişsel yük  (1-back, Sternberg 2-3 öğe, Sıra hatırlama)
  # ════════════════════════════════════════════════════════════════════════════
  "kolay": [

    # ── Uzamsal ──────────────────────────────────────────────────────────────
    dict(id=1,  tip="Uzamsal – Zihinsel Döndürme",
         soru="Aşağıdaki L şekli saat yönünde 90° döndürüldüğünde şeklin üst kenarı hangi yöne gelir?",
         gorsel="[Görsel: L şekli — dikey çubuk sol tarafta, yatay çubuk altta]  →  90° saat yönünde  →  [?]",
         secenekler=["A) Sola", "B) Sağa", "C) Yukarı", "D) Aşağı"],
         dogru="B) Sağa"),

    dict(id=2,  tip="Uzamsal – Şekil Analizi",
         soru="Kare bir kağıdı tam ortadan yatay olarak kesiyorsun. Elde edilen iki parçanın her biri hangi tür dörtgendir?",
         gorsel="[Görsel: Kare → yatay kesim çizgisi → iki parça]",
         secenekler=["A) Kare", "B) Dikdörtgen", "C) Eşkenar dörtgen", "D) Yamuk"],
         dogru="B) Dikdörtgen"),

    dict(id=4,  tip="Uzamsal – Örüntü Sayma",
         soru="3×3 kare ızgarada sol üst köşeden sağ alt köşeye çekilen köşegen üzerinden geçtiği karelerin sayısı kaçtır?",
         gorsel="[Görsel: 3×3 ızgara, köşegendeki kareler mor renkle vurgulanmış]",
         secenekler=["A) 2", "B) 3", "C) 4", "D) 5"],
         dogru="B) 3"),

    dict(id=40, tip="Uzamsal – Zihinsel Döndürme",
         soru="Aşağı bakan ok saat yönünde 90° döndürülürse hangi yöne bakar?",
         gorsel="[Görsel: Aşağı bakan ok]  →  90° saat yönünde  →  [?]",
         secenekler=["A) Sola", "B) Sağa", "C) Yukarı", "D) Aşağı"],
         dogru="A) Sola"),

    dict(id=72, tip="Uzamsal – Zihinsel Döndürme",
         soru="Sağa bakan ok saat yönünün tersine 90° döndürülürse hangi yöne bakar?",
         gorsel="[Görsel: Sağa bakan ok]  →  90° saat yönü tersi  →  [?]",
         secenekler=["A) Sola", "B) Sağa", "C) Yukarı", "D) Aşağı"],
         dogru="C) Yukarı"),

    # ── Sternberg (Bellek: 2-3 öğe) ─────────────────────────────────────────
    dict(id=11, tip="Bellek – Sternberg (2 öğe)",
         soru="Az önce gösterilen harfler arasında K var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: K  →  M",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    dict(id=71, tip="Bellek – Sternberg (3 öğe)",
         soru="\"F\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: A  →  T  →  F",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    dict(id=75, tip="Bellek – Sternberg (3 öğe)",
         soru="\"T\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: N  →  R  →  S",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="B) Hayır"),

    dict(id=78, tip="Bellek – Sternberg (2 öğe)",
         soru="\"W\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: W  →  Z",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    # ── Sıra Hatırlama (Bellek) ──────────────────────────────────────────────
    dict(id=14, tip="Bellek – Sıra Hatırlama (Son öğe)",
         soru="Dizinin son kelimesi neydi?",
         uyaran="Ekranda sırayla gösterilen kelimeler: Elma  →  Armut  →  Kiraz",
         secenekler=["A) Elma", "B) Armut", "C) Kiraz", "D) Üzüm"],
         dogru="C) Kiraz"),

    dict(id=43, tip="Bellek – Sıra Hatırlama (Son öğe)",
         soru="Dizinin son kelimesi neydi?",
         uyaran="Ekranda sırayla gösterilen kelimeler: Araba  →  Uçak  →  Gemi",
         secenekler=["A) Araba", "B) Uçak", "C) Gemi", "D) Tren"],
         dogru="C) Gemi"),

    dict(id=76, tip="Bellek – Sıra Hatırlama (İlk öğe)",
         soru="Dizinin ilk kelimesi neydi?",
         uyaran="Ekranda sırayla gösterilen kelimeler: Köpek  →  Kedi  →  Balık",
         secenekler=["A) Köpek", "B) Kedi", "C) Balık", "D) Kuş"],
         dogru="A) Köpek"),

    dict(id=79, tip="Bellek – Sıra Hatırlama (Son öğe)",
         soru="Dizinin son kelimesi neydi?",
         uyaran="Ekranda sırayla gösterilen kelimeler: Aslan  →  Kaplan  →  Fil",
         secenekler=["A) Aslan", "B) Kaplan", "C) Fil", "D) Kurt"],
         dogru="C) Fil"),

    dict(id=24, tip="Bellek – Sıra Konumu",
         soru="Mavi dizinin kaçıncı elemanıydı?",
         uyaran="Ekranda sırayla gösterilen renkler: Kırmızı  →  Mavi  →  Yeşil",
         secenekler=["A) 1", "B) 2", "C) 3", "D) 4"],
         dogru="B) 2"),

    # ── N-back 1 (Bellek) ────────────────────────────────────────────────────
    dict(id=15, tip="Bellek – 1-back",
         soru="Bu dizide kaç tane bir öncekiyle aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: A  →  B  →  B  →  C\n"
                "Kural: Her harf gösterilirken, bir öncekiyle aynı mı diye karşılaştırın.",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="B) 1  (B–B eşleşmesi)"),

    dict(id=42, tip="Bellek – 1-back",
         soru="Bu dizide kaç tane bir öncekiyle aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: X  →  Y  →  Y  →  Z",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="B) 1  (Y–Y eşleşmesi)"),

    dict(id=45, tip="Bellek – 1-back",
         soru="Bu dizide kaç tane bir öncekiyle aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: H  →  K  →  K  →  L",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="B) 1  (K–K eşleşmesi)"),

    dict(id=70, tip="Bellek – 1-back",
         soru="Bu dizide kaç tane bir öncekiyle aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: P  →  Q  →  Q  →  R",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="B) 1  (Q–Q eşleşmesi)"),

    dict(id=73, tip="Bellek – 1-back",
         soru="Bu dizide kaç tane bir öncekiyle aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: D  →  E  →  F  →  F  →  G",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="B) 1  (F–F eşleşmesi)"),

    dict(id=74, tip="Bellek – 1-back",
         soru="Bu dizide kaç tane bir öncekiyle aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: E  →  E  →  F  →  F",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (E–E ve F–F eşleşmeleri)"),

    dict(id=77, tip="Bellek – 1-back",
         soru="Bu dizide kaç tane bir öncekiyle aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: F  →  G  →  G  →  H",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="B) 1  (G–G eşleşmesi)"),
  ],

  # ════════════════════════════════════════════════════════════════════════════
  # ORTA — Orta bilişsel yük  (2-back, Sternberg 4 öğe, Sıra konumu)
  # ════════════════════════════════════════════════════════════════════════════
  "orta": [

    # ── Uzamsal / Aritmetik ──────────────────────────────────────────────────
    dict(id=5,  tip="Uzamsal – Kağıt Katlama",
         soru="A4 kağıdını önce sağdan sola, sonra yukarıdan aşağı katla. Katlanmış halinin sağ alt köşesine tek bir delik açılır. Kağıt tamamen açıldığında kaç delik oluşur?",
         gorsel="[Görsel: Dikdörtgen → sağdan sola katla → yukarıdan aşağı katla → küçük kare + sağ alt delik → açılınca ?]",
         secenekler=["A) 1 delik, tam ortada",
                     "B) 2 delik, üst ve alt ortada",
                     "C) 3 delik, L şeklinde",
                     "D) 4 delik, köşelerde simetrik"],
         dogru="D) 4 delik, köşelerde simetrik"),

    dict(id=7,  tip="Aritmetik – Dizi Örüntüsü",
         soru="3, 6, 12, 24 dizisinde gelecek iki sonraki sayının toplamı nedir?",
         secenekler=["A) 72", "B) 96", "C) 144", "D) 192"],
         dogru="C) 144  (48 + 96 = 144)"),

    # ── N-back 2 (Bellek) ────────────────────────────────────────────────────
    dict(id=21, tip="Bellek – 2-back (harf)",
         soru="Bu dizide kaç tane 2 adım önceki ile aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: K  →  M  →  P  →  M  →  K  →  M\n"
                "Kural: Her harf gösterilirken, 2 adım öncekiyle karşılaştırın.",
         secenekler=["A) 1", "B) 2", "C) 3", "D) 4"],
         dogru="B) 2  (M[3]=M[1] ve M[5]=M[3] eşleşmeleri)"),

    dict(id=50, tip="Bellek – 2-back (sayı)",
         soru="Bu sayı dizisinde kaç tane 2 adım önceki ile aynı rakam vardı?",
         uyaran="Ekranda sırayla gösterilen sayılar: 3  →  7  →  3  →  7  →  5",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (3[2]=3[0] ve 7[3]=7[1] eşleşmeleri)"),

    dict(id=53, tip="Bellek – 2-back (renk)",
         soru="Bu renk dizisinde kaç tane 2 adım önceki ile aynı renk vardı?",
         uyaran="Ekranda sırayla gösterilen renkler: Kırmızı  →  Mavi  →  Kırmızı  →  Mavi  →  Yeşil",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (Kırmızı[2]=Kırmızı[0] ve Mavi[3]=Mavi[1] eşleşmeleri)"),

    dict(id=54, tip="Bellek – 2-back (harf)",
         soru="Bu dizide kaç tane 2 adım önceki ile aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: R  →  S  →  R  →  S  →  T",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (R[2]=R[0] ve S[3]=S[1] eşleşmeleri)"),

    dict(id=56, tip="Bellek – 2-back (sayı)",
         soru="Bu sayı dizisinde kaç tane 2 adım önceki ile aynı rakam vardı?",
         uyaran="Ekranda sırayla gösterilen sayılar: 6  →  3  →  6  →  3  →  8",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (6[2]=6[0] ve 3[3]=3[1] eşleşmeleri)"),

    dict(id=59, tip="Bellek – 2-back (harf)",
         soru="Bu dizide kaç tane 2 adım önceki ile aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: J  →  K  →  J  →  K  →  M",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (J[2]=J[0] ve K[3]=K[1] eşleşmeleri)"),

    dict(id=82, tip="Bellek – 2-back (sayı)",
         soru="Bu sayı dizisinde kaç tane 2 adım önceki ile aynı rakam vardı?",
         uyaran="Ekranda sırayla gösterilen sayılar: 9  →  2  →  9  →  2  →  5",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (9[2]=9[0] ve 2[3]=2[1] eşleşmeleri)"),

    dict(id=84, tip="Bellek – 2-back (renk)",
         soru="Bu renk dizisinde kaç tane 2 adım önceki ile aynı renk vardı?",
         uyaran="Ekranda sırayla gösterilen renkler: Sarı  →  Mor  →  Sarı  →  Mor  →  Turuncu",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (Sarı[2]=Sarı[0] ve Mor[3]=Mor[1] eşleşmeleri)"),

    # ── Sternberg 4 öğe (Bellek) ─────────────────────────────────────────────
    dict(id=22, tip="Bellek – Sternberg (4 öğe)",
         soru="\"R\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: G  →  R  →  T  →  B",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    dict(id=51, tip="Bellek – Sternberg (4 öğe)",
         soru="\"K\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: A  →  M  →  Z  →  R",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="B) Hayır"),

    dict(id=55, tip="Bellek – Sternberg (4 öğe)",
         soru="\"H\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: H  →  N  →  P  →  D",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    dict(id=57, tip="Bellek – Sternberg (4 öğe)",
         soru="\"K\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: B  →  F  →  L  →  S",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="B) Hayır"),

    dict(id=58, tip="Bellek – Sternberg (4 öğe, kelime)",
         soru="\"Ay\" kelimesi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen kelimeler: Elma  →  Köpek  →  Masa  →  Kalem",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="B) Hayır"),

    dict(id=80, tip="Bellek – Sternberg (4 öğe)",
         soru="\"W\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: C  →  G  →  M  →  W",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    dict(id=83, tip="Bellek – Sternberg (4 öğe)",
         soru="\"X\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: T  →  V  →  X  →  Z",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    # ── Sıra Konumu / Toplam ─────────────────────────────────────────────────
    dict(id=27, tip="Bellek – Sıra + Aritmetik",
         soru="Bu üç rakamın toplamı kaçtır?",
         uyaran="Ekranda sırayla gösterilen rakamlar: 4  →  9  →  2",
         secenekler=["A) 13", "B) 14", "C) 15", "D) 16"],
         dogru="C) 15"),

    dict(id=52, tip="Bellek – Sıra Konumu",
         soru="\"Ay\" dizinin kaçıncı elemanıydı?",
         uyaran="Ekranda sırayla gösterilen kelimeler: Güneş  →  Ay  →  Yıldız  →  Bulut",
         secenekler=["A) 1", "B) 2", "C) 3", "D) 4"],
         dogru="B) 2"),

    dict(id=81, tip="Bellek – Sıra Konumu",
         soru="\"Güneş\" dizinin kaçıncı elemanıydı?",
         uyaran="Ekranda sırayla gösterilen kelimeler: Ay  →  Güneş  →  Yıldız  →  Bulut",
         secenekler=["A) 1", "B) 2", "C) 3", "D) 4"],
         dogru="B) 2"),
  ],

  # ════════════════════════════════════════════════════════════════════════════
  # ZOR — Yüksek bilişsel yük  (3-back, Sternberg 6-7 öğe, Toggle liste)
  # ════════════════════════════════════════════════════════════════════════════
  "zor": [

    # ── Uzamsal ──────────────────────────────────────────────────────────────
    dict(id=9,  tip="Uzamsal – 3B Görselleştirme",
         soru="3×3×3 boyutundaki bir büyük küp, her yüzeyi farklı renkte boyanmıştır (6 yüz = 6 farklı renk). Küp 1×1×1'lik küçük parçalara ayrılıyor. Tam olarak 3 farklı renkle boyalı kaç küçük küp vardır?",
         gorsel="[Görsel: İzometrik küp görünümü. Köşe küpler 3 renkle, kenar küpler 2 renkle, yüzey küpler 1 renkle boyalı]",
         secenekler=["A) 4", "B) 8", "C) 12", "D) 6"],
         dogru="B) 8  (köşe küpler: 8 adet, her biri 3 yüzü boyalı)"),

    # ── N-back 3 (Bellek) ────────────────────────────────────────────────────
    dict(id=31, tip="Bellek – 3-back (harf)",
         soru="Bu dizide kaç tane 3 adım önceki ile aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: B  →  K  →  T  →  M  →  K  →  T\n"
                "Kural: Her harf gösterilirken, 3 adım öncekiyle karşılaştırın.",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (K[4]=K[1] ve T[5]=T[2] eşleşmeleri)"),

    dict(id=60, tip="Bellek – 3-back (sayı)",
         soru="Bu sayı dizisinde kaç tane 3 adım önceki ile aynı rakam vardı?",
         uyaran="Ekranda sırayla gösterilen sayılar: 2  →  5  →  8  →  2  →  5  →  9",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (2[3]=2[0] ve 5[4]=5[1] eşleşmeleri)"),

    dict(id=63, tip="Bellek – 3-back (harf)",
         soru="Bu dizide kaç tane 3 adım önceki ile aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: A  →  B  →  C  →  A  →  B  →  D",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (A[3]=A[0] ve B[4]=B[1] eşleşmeleri)"),

    dict(id=65, tip="Bellek – 3-back (sayı)",
         soru="Bu sayı dizisinde kaç tane 3 adım önceki ile aynı rakam vardı?",
         uyaran="Ekranda sırayla gösterilen sayılar: 4  →  7  →  2  →  4  →  7  →  9",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (4[3]=4[0] ve 7[4]=7[1] eşleşmeleri)"),

    dict(id=67, tip="Bellek – 3-back (harf)",
         soru="Bu dizide kaç tane 3 adım önceki ile aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: P  →  Q  →  R  →  P  →  Q  →  S",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (P[3]=P[0] ve Q[4]=Q[1] eşleşmeleri)"),

    dict(id=86, tip="Bellek – 3-back (harf)",
         soru="Bu dizide kaç tane 3 adım önceki ile aynı harf vardı?",
         uyaran="Ekranda sırayla gösterilen harfler: X  →  Y  →  Z  →  X  →  Y  →  W",
         secenekler=["A) 0", "B) 1", "C) 2", "D) 3"],
         dogru="C) 2  (X[3]=X[0] ve Y[4]=Y[1] eşleşmeleri)"),

    # ── Sternberg 6-7 öğe (Bellek) ───────────────────────────────────────────
    dict(id=32, tip="Bellek – Sternberg (6 öğe)",
         soru="\"M\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: G  →  R  →  T  →  B  →  N  →  S",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="B) Hayır"),

    dict(id=36, tip="Bellek – Sternberg (7 öğe)",
         soru="\"Y\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: Q  →  W  →  E  →  R  →  T  →  Y  →  U",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    dict(id=29, tip="Bellek – Sternberg (5 öğe)",
         soru="\"P\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: M  →  X  →  P  →  L  →  K",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    dict(id=61, tip="Bellek – Sternberg (7 öğe)",
         soru="\"N\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: K  →  T  →  B  →  N  →  F  →  S  →  D",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    dict(id=64, tip="Bellek – Sternberg (7 öğe)",
         soru="\"H\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: A  →  B  →  C  →  D  →  E  →  F  →  G",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="B) Hayır"),

    dict(id=66, tip="Bellek – Sternberg (6 öğe)",
         soru="\"V\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: P  →  V  →  Z  →  R  →  M  →  S",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    dict(id=85, tip="Bellek – Sternberg (6 öğe)",
         soru="\"L\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: D  →  H  →  L  →  N  →  R  →  T",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    dict(id=87, tip="Bellek – Sternberg (7 öğe)",
         soru="\"G\" harfi listede var mıydı?",
         uyaran="Ekranda sırayla gösterilen harfler: C  →  E  →  G  →  I  →  K  →  M  →  O",
         secenekler=["A) Evet", "B) Hayır"],
         dogru="A) Evet"),

    # ── Toggle Liste (Bellek + Yürütücü İşlev) ───────────────────────────────
    dict(id=34, tip="Bellek – Toggle Liste (5 öğe)",
         soru="Son liste nedir?  Kural: Harf gelince listeye EKLE, aynı harf tekrar gelince ÇIKAR.",
         uyaran="Ekranda sırayla gösterilen harfler: A  →  B  →  A  →  C  →  B\n"
                "Adım adım: [A] → [A,B] → [B] → [B,C] → [C]",
         secenekler=["A) A", "B) B", "C) C", "D) A, C"],
         dogru="C) C"),

    dict(id=39, tip="Bellek – Seçici Kodlama",
         soru="Ezberlediğin KIRMIZI kelimeleri seçin.",
         uyaran="Ekranda sırayla gösterilen kelimeler (kırmızı veya mavi):\n"
                "  Köpek [KIRMIZI]  →  4×3=? [MAVİ]  →  Ayak [KIRMIZI]\n"
                "Not: Mavi kelimeler dikkat dağıtıcıdır, ezberlemeyiniz.",
         secenekler=["A) Köpek",
                     "B) Ayak",
                     "C) Köpek, Ayak",
                     "D) Köpek, 4×3=?, Ayak"],
         dogru="C) Köpek, Ayak"),

    dict(id=62, tip="Bellek – Toggle Liste (6 öğe)",
         soru="Son liste nedir?  Kural: Harf gelince EKLE, aynı harf tekrar gelince ÇIKAR.",
         uyaran="Ekranda sırayla gösterilen harfler: X  →  Y  →  X  →  Z  →  Y  →  Z\n"
                "Adım adım: [X] → [X,Y] → [Y] → [Y,Z] → [Z] → []",
         secenekler=["A) X", "B) Y", "C) Z", "D) Boş (hiçbir şey kalmadı)"],
         dogru="D) Boş (hiçbir şey kalmadı)"),

    dict(id=88, tip="Bellek – Toggle Liste (5 öğe)",
         soru="Son liste nedir?  Kural: Harf gelince EKLE, aynı harf tekrar gelince ÇIKAR.",
         uyaran="Ekranda sırayla gösterilen harfler: F  →  G  →  F  →  H  →  G\n"
                "Adım adım: [F] → [F,G] → [G] → [G,H] → [H]",
         secenekler=["A) F", "B) G", "C) H", "D) F, G"],
         dogru="C) H"),
  ],
}

# ─────────────────────────────────────────────────────────
# 3. PDF OLUŞTUR
# ─────────────────────────────────────────────────────────

DIFFICULTY_COLORS = {
    "kolay": colors.HexColor("#2ecc71"),   # yeşil
    "orta":  colors.HexColor("#e67e22"),   # turuncu
    "zor":   colors.HexColor("#e74c3c"),   # kırmızı
}
DIFFICULTY_TR = {
    "kolay": "KOLAY — Düşük Bilişsel Yük",
    "orta":  "ORTA — Orta Bilişsel Yük",
    "zor":   "ZOR — Yüksek Bilişsel Yük",
}

W, H = A4


def build_styles():
    s = getSampleStyleSheet()
    base = dict(fontName=FONT, leading=14)

    styles = {
        "title": ParagraphStyle("title",
            fontName=FONT_BOLD, fontSize=20, leading=26,
            textColor=colors.HexColor("#2c3e50"), spaceAfter=6, alignment=TA_CENTER),

        "subtitle": ParagraphStyle("subtitle",
            fontName=FONT, fontSize=11, leading=16,
            textColor=colors.HexColor("#555"), spaceAfter=4, alignment=TA_CENTER),

        "section": ParagraphStyle("section",
            fontName=FONT_BOLD, fontSize=14, leading=20,
            textColor=colors.white, spaceAfter=0),

        "q_num": ParagraphStyle("q_num",
            fontName=FONT_BOLD, fontSize=10, leading=14,
            textColor=colors.HexColor("#7f8c8d"), spaceBefore=6),

        "q_tip": ParagraphStyle("q_tip",
            fontName=FONT_ITALIC, fontSize=9, leading=13,
            textColor=colors.HexColor("#95a5a6"), spaceAfter=4),

        "q_text": ParagraphStyle("q_text",
            fontName=FONT_BOLD, fontSize=11, leading=16,
            textColor=colors.HexColor("#2c3e50"), spaceAfter=6,
            alignment=TA_JUSTIFY),

        "stim": ParagraphStyle("stim",
            fontName=FONT, fontSize=10, leading=14,
            textColor=colors.HexColor("#2980b9"), spaceAfter=4,
            leftIndent=12, backColor=colors.HexColor("#eaf4fb"),
            borderPad=4),

        "gorsel": ParagraphStyle("gorsel",
            fontName=FONT_ITALIC, fontSize=9, leading=13,
            textColor=colors.HexColor("#7f8c8d"), spaceAfter=4,
            leftIndent=12),

        "option": ParagraphStyle("option",
            fontName=FONT, fontSize=10, leading=14,
            textColor=colors.HexColor("#34495e"), leftIndent=20),

        "correct": ParagraphStyle("correct",
            fontName=FONT_BOLD, fontSize=10, leading=14,
            textColor=colors.HexColor("#27ae60"), leftIndent=20, spaceAfter=8),

        "footer": ParagraphStyle("footer",
            fontName=FONT, fontSize=8, leading=12,
            textColor=colors.HexColor("#aaa"), alignment=TA_CENTER),
    }
    return styles


def build_story(styles):
    story = []

    # ── Kapak ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 3*cm))
    story.append(Paragraph("Bilişsel Yük Çalışması", styles["title"]))
    story.append(Paragraph("Soru Kataloğu", styles["title"]))
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("EEG + NASA-TLX Protokolü", styles["subtitle"]))
    story.append(Paragraph("Kocaeli Üniversitesi | Etik Kurul Onaylı", styles["subtitle"]))
    story.append(Spacer(1, 0.6*cm))

    # Özet tablo
    total = sum(len(v) for v in QUESTIONS.values())
    summary_data = [
        ["Zorluk", "Soru Sayısı", "Blok Süresi", "Paradigma"],
        ["Kolay", f"{len(QUESTIONS['kolay'])} soru", "2 dakika (120 sn)",
         "1-back, Sternberg 2-3 öğe, Sıra hatırlama"],
        ["Orta",  f"{len(QUESTIONS['orta'])} soru",  "3 dakika (180 sn)",
         "2-back, Sternberg 4 öğe, Sıra konumu"],
        ["Zor",   f"{len(QUESTIONS['zor'])} soru",   "3 dakika (180 sn)",
         "3-back, Sternberg 6-7 öğe, Toggle liste"],
        ["TOPLAM", f"{total} soru", "~8 dakika", ""],
    ]
    t = Table(summary_data, colWidths=[3*cm, 3*cm, 4*cm, 7*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#2c3e50")),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTNAME",   (0,0), (-1,0), FONT_BOLD),
        ("FONTSIZE",   (0,0), (-1,-1), 9),
        ("FONTNAME",   (0,1), (-1,-1), FONT),
        ("BACKGROUND", (0,1), (-1,1), colors.HexColor("#d5f5e3")),
        ("BACKGROUND", (0,2), (-1,2), colors.HexColor("#fdebd0")),
        ("BACKGROUND", (0,3), (-1,3), colors.HexColor("#fadbd8")),
        ("BACKGROUND", (0,4), (-1,4), colors.HexColor("#ecf0f1")),
        ("FONTNAME",   (0,4), (-1,4), FONT_BOLD),
        ("GRID",       (0,0), (-1,-1), 0.5, colors.HexColor("#bdc3c7")),
        ("ALIGN",      (0,0), (-1,-1), "CENTER"),
        ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph(
        "Not: Bellek sorularında uyaran (stimulus) önce ekranda gösterilir; "
        "süre dolunca soru metni gelir ve katılımcı yanıtlar.",
        ParagraphStyle("note", fontName=FONT_ITALIC, fontSize=9, leading=13,
                       textColor=colors.HexColor("#7f8c8d"), alignment=TA_CENTER)))
    story.append(PageBreak())

    # ── Her Zorluk Bölümü ────────────────────────────────────────────────────
    for diff in ["kolay", "orta", "zor"]:
        color = DIFFICULTY_COLORS[diff]
        label = DIFFICULTY_TR[diff]
        qs    = QUESTIONS[diff]

        # Bölüm başlığı (renkli şerit)
        header_data = [[Paragraph(label, styles["section"])]]
        ht = Table(header_data, colWidths=[17*cm])
        ht.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), color),
            ("TOPPADDING",    (0,0), (-1,-1), 8),
            ("BOTTOMPADDING", (0,0), (-1,-1), 8),
            ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ]))
        story.append(ht)
        story.append(Spacer(1, 0.3*cm))

        for i, q in enumerate(qs, 1):
            # Soru numarası + tip
            story.append(Paragraph(f"Soru {i}  |  ID: {q['id']}", styles["q_num"]))
            story.append(Paragraph(q["tip"], styles["q_tip"]))

            # Soru metni
            story.append(Paragraph(q["soru"], styles["q_text"]))

            # Görsel açıklaması (varsa)
            if "gorsel" in q:
                story.append(Paragraph(q["gorsel"], styles["gorsel"]))

            # Uyaran / stimulus (varsa)
            if "uyaran" in q:
                for line in q["uyaran"].split("\n"):
                    story.append(Paragraph(line.strip(), styles["stim"]))

            # Seçenekler
            for opt in q["secenekler"]:
                story.append(Paragraph(opt, styles["option"]))

            # Doğru yanıt
            story.append(Paragraph(f"✓ Doğru yanıt: {q['dogru']}", styles["correct"]))

            story.append(HRFlowable(width="100%", thickness=0.5,
                                    color=colors.HexColor("#ecf0f1"),
                                    spaceAfter=4, spaceBefore=2))

        story.append(PageBreak())

    return story


def main():
    out_path = os.path.join(
        r"C:\Users\Acer\Desktop\Yeni klasör\eeg-bilissel-yuk",
        "sorular_katalogu.pdf"
    )

    doc = SimpleDocTemplate(
        out_path,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm,  bottomMargin=2*cm,
        title="EEG Bilişsel Yük — Soru Kataloğu",
        author="Kocaeli Üniversitesi",
        subject="EEG Kognitif Yük Çalışması Soruları",
    )

    styles = build_styles()
    story  = build_story(styles)

    doc.build(story)
    print(f"\n[OK] PDF olusturuldu: {out_path}")
    print(f"  Toplam soru: {sum(len(v) for v in QUESTIONS.values())}")
    print(f"  Kolay: {len(QUESTIONS['kolay'])}  |  Orta: {len(QUESTIONS['orta'])}  |  Zor: {len(QUESTIONS['zor'])}")


if __name__ == "__main__":
    main()
