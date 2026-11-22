"""Move GLBs from the legacy ``Landmark.model_file`` / ``Era.model_file`` fields into
``LandmarkModel`` rows (LOD "high"). The files themselves stay where they are."""
from django.db import migrations


def forwards(apps, schema_editor):
    Landmark = apps.get_model("landmarks", "Landmark")
    Era = apps.get_model("landmarks", "Era")
    LandmarkModel = apps.get_model("landmarks", "LandmarkModel")

    for landmark in Landmark.objects.exclude(model_file=""):
        LandmarkModel.objects.get_or_create(
            landmark=landmark, era=None, lod="high",
            defaults={"file": landmark.model_file.name, "credit": landmark.model_credit, "is_illustrative": True},
        )
    for era in Era.objects.exclude(model_file=""):
        LandmarkModel.objects.get_or_create(
            landmark_id=era.landmark_id, era=era, lod="high",
            defaults={"file": era.model_file.name, "is_illustrative": True},
        )


def backwards(apps, schema_editor):
    LandmarkModel = apps.get_model("landmarks", "LandmarkModel")
    for model in LandmarkModel.objects.filter(lod="high").select_related("landmark", "era"):
        if model.era_id:
            model.era.model_file = model.file.name
            model.era.save(update_fields=["model_file"])
        else:
            model.landmark.model_file = model.file.name
            model.landmark.model_credit = model.credit
            model.landmark.save(update_fields=["model_file", "model_credit"])


class Migration(migrations.Migration):
    dependencies = [("landmarks", "0003_historicalsource_landmarkmodel_era_year_end_and_more")]

    operations = [migrations.RunPython(forwards, backwards)]
