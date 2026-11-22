"""Seed categories, landmarks, a default story and the About page.

Data policy (see TECHNICAL_AUDIT.md §7):
* Coordinates come from Wikidata (Q-ids recorded in ``coordinates_source``),
  checked on 2026-11-22. For the Pamir Highway, a linear road, the marker sits
  at Murghab (Q1018209), the main town on the highway.
* Elevations come from Wikidata (P2044) where available, otherwise they are
  sampled from the same AWS Terrain Tiles data the map is built from. For
  areas (a range, a park) the terrain at the marker is used, not the highest peak.
* Historical texts are NOT invented. The only historical statement seeded is
  Sarazm's dating, quoted from its UNESCO World Heritage listing, with the source attached.

Safe to re-run: rows are updated, never duplicated, and texts already written in
the admin are kept (seed values only fill empty fields).
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import SitePage
from apps.landmarks.models import Category, Era, HistoricalSource, Hotspot, Landmark
from apps.stories.models import Story, StoryStep

LANGS = ("tg", "ru", "en")

CATEGORIES = [
    # slug, (tg, ru, en), colour, icon
    ("nature", ("Табиат", "Природа", "Nature"), "#5fb89a", "leaf"),
    ("history", ("Таърих", "История", "History"), "#d4a64a", "scroll"),
    ("architecture", ("Меъморӣ", "Архитектура", "Architecture"), "#e07a5f", "arch"),
    ("lakes", ("Кӯлҳо", "Озёра", "Lakes"), "#4fa3d9", "wave"),
    ("mountains", ("Кӯҳҳо", "Горы", "Mountains"), "#c9d4e6", "peak"),
]

# slug, category, placeholder, lat, lon, elevation, coordinates source, featured, names, subtitles
LANDMARKS = [
    ("sarazm", "history", "settlement", 39.5167, 67.5667, 983, "Wikidata Q422929", True,
     ("Саразм", "Саразм", "Sarazm"),
     ("Шаҳраки бостонӣ дар водии Зарафшон", "Древнее поселение в долине Зеравшана", "Ancient settlement in the Zarafshan valley")),
    ("ancient-panjakent", "history", "settlement", 39.4855, 67.6178, 1046, "Wikidata Q13202264", False,
     ("Панҷакенти қадим", "Древний Пенджикент", "Ancient Panjakent"),
     ("Шаҳристони қадима дар водии Зарафшон", "Городище в долине Зеравшана", "Ancient city site in the Zarafshan valley")),
    ("haft-kul", "lakes", "lakes", 39.1426, 67.8549, 2118, "Wikidata Q20614802", False,
     ("Ҳафткӯл", "Семь озёр (Хафткуль)", "Haft Kul — Seven Lakes"),
     ("Ҳафт кӯли водии Шинг", "Семь озёр долины Шинг", "Seven lakes of the Shing valley")),
    ("fann-mountains", "mountains", "range", 39.1667, 68.2500, 3678, "Wikidata Q2997163", False,
     ("Кӯҳҳои Фон", "Фанские горы", "Fann Mountains"),
     ("Қаторкӯҳи баланд дар Тоҷикистони Шимолӣ", "Высокогорный массив на севере Таджикистана", "High mountain massif of northern Tajikistan")),
    ("iskandarkul", "lakes", "lake", 39.0744, 68.3683, 2195, "Wikidata Q2478596", True,
     ("Искандаркӯл", "Искандеркуль", "Iskandarkul"),
     ("Кӯли кӯҳӣ дар кӯҳҳои Фон", "Горное озеро в Фанских горах", "Mountain lake in the Fann Mountains")),
    ("hisor-fortress", "architecture", "fortress", 38.4841, 68.5934, 735, "Wikidata Q20614705", True,
     ("Қалъаи Ҳисор", "Гиссарская крепость", "Hisor Fortress"),
     ("Қалъа дар водии Ҳисор", "Крепость в Гиссарской долине", "Fortress in the Hisor valley")),
    ("dushanbe", "architecture", "monument", 38.5740, 68.7854, 832, "Wikidata Q12124447 (Ismoil Somoni monument)", False,
     ("Душанбе", "Душанбе", "Dushanbe"),
     ("Пойтахт: ёдгории Исмоили Сомонӣ ва Кохи Наврӯз",
      "Столица: монумент Исмоилу Сомони и дворец Навруз",
      "The capital: Ismoil Somoni monument and Navruz Palace")),
    ("ajina-tepa", "history", "stupa", 37.7980, 68.8544, 434, "Wikidata Q4057547", False,
     ("Аҷинатеппа", "Аджина-Тепа", "Ajina Tepa"),
     ("Ёдгории буддоӣ дар водии Вахш", "Буддийский памятник в долине Вахша", "Buddhist site in the Vakhsh valley")),
    ("nurek-reservoir", "nature", "reservoir", 38.3319, 69.3619, 879, "Wikidata Q13554267", False,
     ("Обанбори Норак", "Нурекское водохранилище", "Nurek Reservoir"),
     ("Обанбор дар дарёи Вахш", "Водохранилище на реке Вахш", "Reservoir on the Vakhsh river")),
    ("khujand-fortress", "architecture", "fortress", 40.2848, 69.6168, 331, "Wikidata Q13202354", False,
     ("Қалъаи Хуҷанд", "Худжандская крепость", "Khujand Fortress"),
     ("Қалъа дар соҳили Сир", "Крепость на берегу Сырдарьи", "Fortress on the Syr Darya")),
    ("ismoil-somoni-peak", "mountains", "peak", 38.9427, 72.0153, 7495, "Wikidata Q41413", True,
     ("Қуллаи Исмоили Сомонӣ", "Пик Исмоила Сомони", "Ismoil Somoni Peak"),
     ("Баландтарин қуллаи Тоҷикистон", "Высочайшая вершина Таджикистана", "The highest summit of Tajikistan")),
    ("tajik-national-park", "nature", "range", 38.7412, 72.1198, 3113, "Wikidata Q3076575", False,
     ("Боғи миллии Тоҷикистон", "Таджикский национальный парк", "Tajik National Park"),
     ("Кӯҳҳои Помир — мероси табиӣ", "Горы Памира — природное наследие", "Mountains of the Pamirs — natural heritage")),
    ("yamchun-fortress", "history", "fortress", 36.9697, 72.2608, 3083, "Wikidata Q97999750", False,
     ("Қалъаи Ямчун", "Крепость Ямчун", "Yamchun Fortress"),
     ("Қалъа дар водии Вахон", "Крепость в Ваханской долине", "Fortress in the Wakhan valley")),
    ("karakul-lake", "lakes", "lake", 39.0400, 73.4200, 3900, "Wikidata Q720015", False,
     ("Кӯли Қаракӯл", "Озеро Каракуль", "Karakul Lake"),
     ("Кӯли баландкӯҳи Помири Шарқӣ", "Высокогорное озеро Восточного Памира", "High-altitude lake of the Eastern Pamir")),
    ("pamir-highway", "mountains", "road", 38.1711, 73.9669, 3650, "Wikidata Q1018209 (Murghab, on the highway)", False,
     ("Шоҳроҳи Помир", "Памирский тракт", "Pamir Highway"),
     ("Роҳи баландкӯҳ аз байни Помир", "Высокогорная дорога через Памир", "High-mountain road across the Pamirs")),
]

# Hotspot positions match the procedural "fortress" placeholder in the frontend.
FORTRESS_HOTSPOTS = [
    ((0.0, 0.55, 2.1), ("Дарвоза", "Ворота", "Gate")),
    ((-2.0, 1.75, -2.0), ("Бурҷ", "Башня", "Tower")),
    ((0.0, 1.0, 0.0), ("Ҳавлии дарунӣ", "Внутренний двор", "Inner courtyard")),
]

UNESCO_SARAZM = {
    "title": "Proto-urban Site of Sarazm",
    "publisher": "UNESCO World Heritage Centre",
    "url": "https://whc.unesco.org/en/list/1141/",
    "citation": "UNESCO World Heritage Centre. Proto-urban Site of Sarazm (World Heritage List, no. 1141).",
}

SARAZM_ERAS = [
    {
        "year": -4000, "year_end": -2000, "year_is_approximate": True, "placeholder_variant": "restored", "order": 0,
        "label": ("Шаҳраки қадима", "Протогородское поселение", "Proto-urban settlement"),
        "description": (
            "Аз ҳазораи IV то охири ҳазораи III пеш аз милод (ЮНЕСКО).",
            "С IV до конца III тысячелетия до н. э. (ЮНЕСКО).",
            "From the 4th to the late 3rd millennium BCE (UNESCO).",
        ),
        "sourced": True,
    },
    {
        "year": 2026, "year_end": None, "year_is_approximate": False, "placeholder_variant": "ruins", "order": 1,
        "label": ("Имрӯз", "Сегодня", "Today"),
        "description": ("Ёдгории бостоншиносӣ.", "Археологический памятник.", "Archaeological site."),
        "sourced": False,
    },
]


def tr(values: tuple[str, str, str], field: str) -> dict:
    return {f"{field}_{lang}": value for lang, value in zip(LANGS, values)}


def fill_empty(obj, values: dict) -> None:
    """Set translated values only where the field is still empty (keeps editors' work)."""
    for key, value in values.items():
        if not getattr(obj, key):
            setattr(obj, key, value)


class Command(BaseCommand):
    help = "Create or update seed categories, landmarks, the default story and the About page."

    @transaction.atomic
    def handle(self, *args, **options):
        verbose = options["verbosity"] > 1
        categories = {}
        for order, (slug, names, color, icon) in enumerate(CATEGORIES):
            categories[slug], _ = Category.objects.update_or_create(
                slug=slug, defaults={**tr(names, "name"), "color": color, "icon": icon, "order": order},
            )

        landmarks = []
        for order, (slug, cat, placeholder, lat, lon, elev, source, featured, names, subtitles) in enumerate(LANDMARKS):
            landmark = Landmark.objects.filter(slug=slug).first()
            created = landmark is None
            if created:
                landmark = Landmark(slug=slug, is_featured=featured)
            landmark.category = categories[cat]
            landmark.placeholder = placeholder
            landmark.latitude, landmark.longitude, landmark.elevation_m = lat, lon, elev
            landmark.coordinates_source = source
            landmark.order = order
            fill_empty(landmark, {**tr(names, "name"), **tr(subtitles, "subtitle")})
            landmark.save()
            landmarks.append(landmark)

            if placeholder == "fortress" and not landmark.hotspots.exists():
                for i, ((x, y, z), titles) in enumerate(FORTRESS_HOTSPOTS):
                    Hotspot.objects.create(landmark=landmark, x=x, y=y, z=z, order=i, **tr(titles, "title"))
            if verbose:
                self.stdout.write(("+ " if created else "~ ") + slug)

        self._seed_sarazm(next(lm for lm in landmarks if lm.slug == "sarazm"))
        self._seed_story(landmarks)
        self._seed_about()
        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(CATEGORIES)} categories, {len(LANDMARKS)} landmarks, 1 story and the About page."
        ))

    def _seed_sarazm(self, sarazm: Landmark) -> None:
        source, _ = HistoricalSource.objects.get_or_create(url=UNESCO_SARAZM["url"], defaults=UNESCO_SARAZM)
        sarazm.sources.add(source)
        if sarazm.eras.exists():
            return
        for spec in SARAZM_ERAS:
            era = Era.objects.create(
                landmark=sarazm, year=spec["year"], year_end=spec["year_end"],
                year_is_approximate=spec["year_is_approximate"], placeholder_variant=spec["placeholder_variant"],
                order=spec["order"], **tr(spec["label"], "label"), **tr(spec["description"], "description"),
            )
            if spec["sourced"]:
                era.sources.add(source)

    def _seed_story(self, landmarks: list[Landmark]) -> None:
        story, created = Story.objects.get_or_create(
            slug="grand-tour",
            defaults={
                **tr(("Сафари бузург", "Большое путешествие", "The grand tour"), "title"),
                **tr(("Аз ғарб ба шарқ: аз Зарафшон то Помир",
                      "С запада на восток: от Зеравшана до Памира",
                      "West to east: from the Zarafshan to the Pamirs"), "subtitle"),
                "is_default": True,
            },
        )
        if created or not story.steps.exists():
            for i, landmark in enumerate(landmarks):
                StoryStep.objects.create(story=story, landmark=landmark, order=i)

    def _seed_about(self) -> None:
        page, _ = SitePage.objects.get_or_create(slug="about")
        fill_empty(page, {
            **tr(("Дар бораи Тоҷикистон", "О Таджикистане", "About Tajikistan"), "title"),
            **tr(("Тоҷикистон — кишвари кӯҳсор дар Осиёи Марказӣ.",
                  "Таджикистан — горная страна в Центральной Азии.",
                  "Tajikistan is a mountainous country in Central Asia."), "lead"),
        })
        page.save()
