import re
import unicodedata
from pydantic import BaseModel, field_validator, Field




# Maximum characters allowed in a movie name query
MAX_MOVIE_NAME_LENGTH = 150

# Minimum characters required
MIN_MOVIE_NAME_LENGTH = 1

# Allowlist pattern: Unicode letters, digits, spaces, and common punctuation
# found in real movie titles (hyphens, apostrophes, colons, periods, commas,
# ampersands, exclamation marks, question marks, parentheses).
_ALLOWED_PATTERN = re.compile(
    r"^[\w\s\-'\":.,&!?()\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]+$",
    re.UNICODE,
)

_STRIP_CHARS_PATTERN = re.compile(r"[<>;\\`{}|^~\[\]]")





def sanitize_movie_name(raw: str) -> str:
    
    # 1. Unicode normalization
    value = unicodedata.normalize("NFC", raw)
    # 2. Strip outer whitespace
    value = value.strip()
    # 3. Collapse internal whitespace
    value = re.sub(r"\s+", " ", value)
    # 4. Remove dangerous characters
    value = _STRIP_CHARS_PATTERN.sub("", value)
    # 5. Truncate
    value = value[:MAX_MOVIE_NAME_LENGTH]
    return value





class MovieNameInput(BaseModel):

    movie_name: str = Field(
        ...,
        min_length=MIN_MOVIE_NAME_LENGTH,
        max_length=MAX_MOVIE_NAME_LENGTH,
        description="The name of the movie to search for recommendations.",
    )

    @field_validator("movie_name", mode="before")
    @classmethod
    def sanitize(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("Movie name must be a string.")
        return sanitize_movie_name(v)

    @field_validator("movie_name")
    @classmethod
    def no_empty_after_sanitize(cls, v: str) -> str:
        
        if not v:
            raise ValueError(
                "Movie name is empty or contains only disallowed characters."
            )
        return v

    @field_validator("movie_name")
    @classmethod
    def allowed_characters(cls, v: str) -> str:
        """Enforce an allowlist of characters valid in movie titles."""
        if not _ALLOWED_PATTERN.match(v):
            raise ValueError(
                "Movie name contains invalid characters. "
                "Only letters, digits, spaces, hyphens, apostrophes, "
                "colons, periods, commas, ampersands, and common punctuation "
                "are allowed."
            )
        return v

    @property
    def normalized(self) -> str:
        
        return self.movie_name.strip().lower()
