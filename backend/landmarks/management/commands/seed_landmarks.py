"""Seed categories and the initial 12 landmarks.

Only names, short taglines and approximate coordinates are seeded. Historical
texts are intentionally left empty — write them in the admin
(filter "content status → Needs text"). Coordinates are approximate; verify
them before launch. Safe to re-run: existing rows are updated, never duplicated,
and texts you already wrote in the admin are not overwritten.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from landmarks.models import Category, Hotspot, Landmark, LandmarkEra

CATEGORIES = [
    # slug, tg, ru, en, colour, icon
    ("nature", "Табиат", "Природа", "Nature", "#5fb89a", "leaf"),
    ("history", "Таърих", "История", "History", "#d4a64a", "scroll"),
    ("architecture", "Меъморӣ", "Архитектура", "Architecture", "#e07a5f", "arch"),
    ("lakes", "Кӯлҳо", "Озёра", "Lakes", "#4fa3d9", "wave"),
    ("mountains", "Кӯҳҳо", "Горы", "Mountains", "#c9d4e6", "peak"),
]

# slug, category, placeholder, lat, lon, elevation, names (tg, ru, en), subtitles (tg, ru, en)
LANDMARKS = [
    ("hisor-fortress", "architecture", "fortress", 38.5170, 68.5510, 800,
     ("Қалъаи Ҳисор", "Гиссарская крепость", "Hisor Fortress"),
     ("Қалъа дар водии Ҳисор", "Крепость в Гиссарской долине", "Fortress in the Hisor valley")),
    ("sarazm", "history", "settlement", 39.5080, 67.4610, 900,
     ("Саразм", "Саразм", "Sarazm"),
     ("Шаҳраки бостонӣ дар водии Зарафшон", "Древнее поселение в долине Зеравшана", "Ancient settlement in the Zarafshan valley")),
    ("iskandarkul", "lakes", "lake", 39.0770, 68.3750, 2195,
     ("Искандаркӯл", "Искандеркуль", "Iskandarkul"),
     ("Кӯли кӯҳӣ дар кӯҳҳои Фон", "Горное озеро в Фанских горах", "Mountain lake in the Fann Mountains")),
    ("haft-kul", "lakes", "lakes", 39.1500, 67.9900, 2100,
     ("Ҳафткӯл", "Семь озёр (Хафткуль)", "Haft Kul — Seven Lakes"),
     ("Ҳафт кӯли водии Шинг", "Семь озёр долины Шинг", "Seven lakes of the Shing valley")),
    ("nurek-reservoir", "nature", "reservoir", 38.3800, 69.3500, 910,
     ("Обанбори Норак", "Нурекское водохранилище", "Nurek Reservoir"),
     ("Обанбор дар дарёи Вахш", "Водохранилище на реке Вахш", "Reservoir on the Vakhsh river")),
    ("karakul-lake", "lakes", "lake", 39.0200, 73.5300, 3900,
     ("Кӯли Қаракӯл", "Озеро Каракуль", "Karakul Lake"),
     ("Кӯли баландкӯҳи Помири Шарқӣ", "Высокогорное озеро Восточного Памира", "High-altitude lake of the Eastern Pamir")),
    ("ismoil-somoni-peak", "mountains", "peak", 38.9430, 72.0160, 7495,
     ("Қуллаи Исмоили Сомонӣ", "Пик Исмоила Сомони", "Ismoil Somoni Peak"),
     ("Баландтарин қуллаи Тоҷикистон", "Высочайшая вершина Таджикистана", "The highest summit of Tajikistan")),
    ("pamir-highway", "mountains", "road", 38.1700, 73.9600, 3650,
     ("Шоҳроҳи Помир", "Памирский тракт", "Pamir Highway"),
     ("Роҳи баландкӯҳ аз байни Помир", "Высокогорная дорога через Памир", "High-mountain road across the Pamirs")),
    ("yamchun-fortress", "history", "fortress", 36.9950, 72.1300, 3000,
     ("Қалъаи Ямчун", "Крепость Ямчун", "Yamchun Fortress"),
     ("Қалъа дар водии Вахон", "Крепость в Ваханской долине", "Fortress in the Wakhan valley")),
    ("ajina-tepa", "history", "stupa", 37.8000, 68.9100, 450,
     ("Аҷинатеппа", "Аджина-Тепа", "Ajina Tepa"),
     ("Ёдгории буддоӣ дар водии Вахш", "Буддийский памятник в долине Вахша", "Buddhist site in the Vakhsh valley")),
    ("khujand-fortress", "architecture", "fortress", 40.2870, 69.6320, 330,
     ("Қалъаи Хуҷанд", "Худжандская крепость", "Khujand Fortress"),
     ("Қалъа дар соҳили Сир", "Крепость на берегу Сырдарьи", "Fortress on the Syr Darya")),
    ("dushanbe", "architecture", "monument", 38.5760, 68.7800, 800,
     ("Душанбе", "Душанбе", "Dushanbe"),
     ("Пойтахт: ёдгории Исмоили Сомонӣ ва Кохи Наврӯз",
      "Столица: монумент Исмоилу Сомони и дворец Навруз",
      "The capital: Ismoil Somoni monument and Navruz Palace")),
]

# Hotspot positions match the procedural "fortress" placeholder in the frontend.
FORTRESS_HOTSPOTS = [
    ((0.0, 0.55, 2.1), ("Дарвоза", "Ворота", "Gate")),
    ((-2.0, 1.75, -2.0), ("Бурҷ", "Башня", "Tower")),
    ((0.0, 1.0, 0.0), ("Ҳавлии дарунӣ", "Внутренний двор", "Inner courtyard")),
]


def _translated(values: tuple[str, str, str], field: str) -> dict:
    return {f"{field}_{lang}": value for lang, value in zip(("tg", "ru", "en"), values)}


class Command(BaseCommand):
    help = "Create or update the seed categories and landmarks."

    @transaction.atomic
    def handle(self, *args, **options):
        categories = {}
        for order, (slug, tg, ru, en, color, icon) in enumerate(CATEGORIES):
            categories[slug], _ = Category.objects.update_or_create(
                slug=slug,
                defaults={**_translated((tg, ru, en), "name"), "color": color, "icon": icon, "order": order},
            )

        for order, (slug, cat, placeholder, lat, lon, elev, names, subtitles) in enumerate(LANDMARKS):
            landmark, created = Landmark.objects.get_or_create(
                slug=slug,
                defaults={"category": categories[cat], "latitude": lat, "longitude": lon},
            )
            landmark.category = categories[cat]
            landmark.placeholder = placeholder
            landmark.latitude, landmark.longitude, landmark.elevation_m = lat, lon, elev
            landmark.order = order
            for field, values in (("name", names), ("subtitle", subtitles)):
                for key, value in _translated(values, field).items():
                    if created or not getattr(landmark, key):
                        setattr(landmark, key, value)
            landmark.save()

            if placeholder == "fortress" and not landmark.hotspots.exists():
                for i, ((x, y, z), titles) in enumerate(FORTRESS_HOTSPOTS):
                    Hotspot.objects.create(landmark=landmark, x=x, y=y, z=z, order=i, **_translated(titles, "title"))

            if slug == "sarazm" and not landmark.eras.exists():
                LandmarkEra.objects.create(
                    landmark=landmark, year=-3500, order=0, placeholder_variant="restored",
                    **_translated(("Шаҳраки қадима", "Древнее поселение", "Ancient settlement"), "label"),
                )
                LandmarkEra.objects.create(
                    landmark=landmark, year=2026, order=1, placeholder_variant="ruins",
                    **_translated(("Имрӯз", "Сегодня", "Today"), "label"),
                )

            if options["verbosity"] > 1:
                self.stdout.write(("+ " if created else "~ ") + slug)

        self.stdout.write(self.style.SUCCESS(f"Seeded {len(CATEGORIES)} categories and {len(LANDMARKS)} landmarks."))
