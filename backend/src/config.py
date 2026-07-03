from pydantic import Field
from pydantic.aliases import AliasChoices
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    tmdb_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("API_KEY", "TMDB_API_KEY", "tmdb_api_key"),
    )
    api_read_access_token: str = ""

    redis_url: str
    rate_limit_window: int = 60
    rate_limit_max_requests: int = 100

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()