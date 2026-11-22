from django.db import models


class SitePage(models.Model):
    """Editable static pages such as "About Tajikistan". Body: blank lines separate paragraphs."""

    slug = models.SlugField(unique=True)
    title = models.CharField(max_length=160)  # i18n
    lead = models.TextField(blank=True, help_text="Short introduction shown large.")  # i18n
    body = models.TextField(blank=True)  # i18n
    is_published = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["slug"]
        verbose_name = "site page"

    def __str__(self) -> str:
        return self.title or self.slug
