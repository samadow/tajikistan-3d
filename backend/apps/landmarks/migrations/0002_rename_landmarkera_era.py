from django.db import migrations


class Migration(migrations.Migration):
    """LandmarkEra → Era. Done as a pure rename so existing rows are kept."""

    dependencies = [("landmarks", "0001_initial")]

    operations = [migrations.RenameModel("LandmarkEra", "Era")]
