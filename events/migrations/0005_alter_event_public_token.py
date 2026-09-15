import uuid

from django.db import migrations, models


def populate_public_tokens(apps, schema_editor):
    Event = apps.get_model("events", "Event")

    for event in Event.objects.all():
        event.public_token = uuid.uuid4()
        event.save(
            update_fields=["public_token"]
        )


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0004_event_public_token"),
    ]

    operations = [
        migrations.RunPython(
            populate_public_tokens,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="event",
            name="public_token",
            field=models.UUIDField(
                default=uuid.uuid4,
                editable=False,
                unique=True,
            ),
        ),
    ]