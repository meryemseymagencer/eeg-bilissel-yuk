import random

class MentalArithmeticGenerator:
    """
    Sınav simülasyonu için rastgele zihinsel aritmetik soruları üretir.
    Zorluk seviyeleri: easy (1 basamak), medium (2 basamak), hard (karmaşık).
    """
    def __init__(self):
        self.levels = ["easy", "medium", "hard"]
        self.current_answer = None

    def generate_question(self, level="easy"):
        """Belirtilen zorluk seviyesine göre bir soru ve cevap üretir."""
        if level == "easy":
            # Örn: 7 + 8, 9 - 4
            a = random.randint(1, 9)
            b = random.randint(1, 9)
            op = random.choice(["+", "-"])
        elif level == "medium":
            # Örn: 42 + 17, 85 - 23
            a = random.randint(10, 50)
            b = random.randint(10, 50)
            op = random.choice(["+", "-"])
        else: # hard
            # Örn: 12 * 4, 75 + 38
            a = random.randint(10, 99)
            b = random.randint(2, 15)
            op = random.choice(["+", "*"])

        if op == "+":
            self.current_answer = a + b
        elif op == "-":
            # Sonucun negatif çıkmaması için
            a, b = max(a, b), min(a, b)
            self.current_answer = a - b
        else: # *
            self.current_answer = a * b

        return f"{a} {op} {b} = ?", str(self.current_answer)

    def check_answer(self, user_answer):
        """Kullanıcının cevabını kontrol eder."""
        try:
            return str(user_answer).strip() == str(self.current_answer)
        except Exception:
            return False