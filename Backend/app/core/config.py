# pyrefly: ignore [missing-import]
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # This must match the exact variable name in your .env file
    DATABASE_URL: str

    # This tells Pydantic to look for the .env file in our root folder
    model_config = SettingsConfigDict(env_file=".env")

# We create a single instance of the settings to use throughout our app
settings = Settings()
