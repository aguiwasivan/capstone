from pathlib import Path
import os
from urllib.parse import quote, urlparse

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env', override=False)


def env(name, default=None, required=False):
    value = os.getenv(name, default)
    if required and not value:
        raise ImproperlyConfigured(f'Missing required environment variable: {name}')
    return value


def env_list(name, default=""):
    return [item.strip() for item in env(name, default).split(",") if item.strip()]


def env_bool(name, default=False):
    return env(name, str(default)).lower() in ("1", "true", "yes", "on")


def normalize_database_url(value):
    if not value:
        return value

    try:
        urlparse(value)
        return value
    except ValueError:
        pass

    if '@' not in value or '://' not in value:
        return value

    scheme, remainder = value.split('://', 1)
    credentials, host = remainder.rsplit('@', 1)
    if ':' not in credentials:
        return value

    username, password = credentials.split(':', 1)
    return f'{scheme}://{username}:{quote(password, safe="")}@{host}'


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env('SECRET_KEY', 'django-insecure-local-dev-key-change-me')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env_bool('DEBUG', True)
# Production security settings
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 0

ALLOWED_HOSTS = env_list('ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver')


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',

    'accounts',
    'sales',
]


MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]


ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases

database_url = normalize_database_url(env('DATABASE_URL', ''))
if database_url:
    parsed_database_url = urlparse(database_url)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': parsed_database_url.path.lstrip('/'),
            'USER': parsed_database_url.username,
            'PASSWORD': parsed_database_url.password,
            'HOST': parsed_database_url.hostname,
            'PORT': parsed_database_url.port or '5432',
            'OPTIONS': {
                'sslmode': env('DB_SSLMODE', 'require'),
            },
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': env('DB_NAME', required=True),
            'USER': env('DB_USER', required=True),
            'PASSWORD': env('DB_PASSWORD', required=True),
            'HOST': env('DB_HOST', required=True),
            'PORT': env('DB_PORT', '5432'),
            'OPTIONS': {
                'sslmode': env('DB_SSLMODE', 'require'),
            },
        }
    }


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/


STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

STORAGES = {
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}


# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'accounts.User'

CORS_ALLOWED_ORIGINS = env_list('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000')

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
}

OPENAI_IMAGE_MODEL = env('OPENAI_IMAGE_MODEL', 'gpt-image-1')
OPENAI_IMAGE_FALLBACK_MODEL = env('OPENAI_IMAGE_FALLBACK_MODEL', 'dall-e-3')
OPENAI_IMAGE_MODELS = env('OPENAI_IMAGE_MODELS', '')
OPENAI_IMAGE_LOCAL_FALLBACK = env_bool('OPENAI_IMAGE_LOCAL_FALLBACK', True)
OPENAI_IMAGE_SIZE = env('OPENAI_IMAGE_SIZE', '1536x1024')
OPENAI_IMAGE_QUALITY = env('OPENAI_IMAGE_QUALITY', 'medium')
OPENAI_TEXT_MODEL = env('OPENAI_TEXT_MODEL', 'gpt-4o-mini')
OPENAI_TIMEOUT_SECONDS = int(env('OPENAI_TIMEOUT_SECONDS', '90'))
AI_API_KEY = env('AI_API_KEY', env('OPENAI_API_KEY', ''))
AI_VISION_MODEL = env('AI_VISION_MODEL', env('OPENAI_TEXT_MODEL', 'gpt-4o-mini'))

SUPABASE_URL = env('SUPABASE_URL', '')
SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY', '')
SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY', '')
SUPABASE_STORAGE_BUCKET = env('SUPABASE_STORAGE_BUCKET', 'blueprints')

if env_bool('SUPABASE_CONFIG_DEBUG', DEBUG):
    print('SUPABASE_URL exists:', bool(os.getenv('SUPABASE_URL')))
    print('SUPABASE_SERVICE_ROLE_KEY exists:', bool(os.getenv('SUPABASE_SERVICE_ROLE_KEY')))
    print('SUPABASE_STORAGE_BUCKET:', os.getenv('SUPABASE_STORAGE_BUCKET', 'blueprints'))
