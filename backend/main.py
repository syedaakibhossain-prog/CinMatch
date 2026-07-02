from fastapi import FastAPI, HTTPException, Depends, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from src.recomender import get_recommendations
from src.validators import MovieNameInput, MAX_MOVIE_NAME_LENGTH
from middleware.rate_limiter import rate_limit

app = FastAPI(
    title="Movie Recommendation API",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://cin-match-six.vercel.app"],  # Change this to your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "message": "Movie Recommendation API is running!"
    }


@app.get("/recommended/{movie_name}")
async def recommend_movies(
    movie_name: str = Path(
        ...,
        min_length=1,
        max_length=MAX_MOVIE_NAME_LENGTH,
        description="Name of the movie to get recommendations for.",
    ),
    _: None = Depends(rate_limit()),
):
    # Validate and sanitize the input via the Pydantic model.
    # Any validation error is surfaced as a 422 before hitting the ML model.
    try:
        validated = MovieNameInput(movie_name=movie_name)
    except ValidationError as exc:
        # Extract the first human-readable error message.
        first_error = exc.errors()[0]["msg"]
        raise HTTPException(status_code=422, detail=first_error)

    recommendations = await get_recommendations(validated.normalized)

    if recommendations is None:
        raise HTTPException(
            status_code=404,
            detail="Movie not found."
        )

    return {
        "searched_movie": validated.movie_name,
        "total": len(recommendations),
        "recommendations": recommendations
    }


@app.get("/health")
async def health_check():
    return {"status": "ok"}
