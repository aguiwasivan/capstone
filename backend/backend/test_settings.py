from .settings import *

# Isolate regression tests from the configured application database.
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
