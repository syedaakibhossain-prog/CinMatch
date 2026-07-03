import asyncio
import os
import pickle

import httpx
from scipy import sparse
from sklearn.metrics.pairwise import cosine_similarity

from src.config import settings



_DIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(_DIR, "movies.pkl"), "rb") as f:
    movies = pickle.load(f)

with open(os.path.join(_DIR, "vectorizer.pkl"), "rb") as f:
    vectorizer = pickle.load(f)

movie_vectors = sparse.load_npz(
    os.path.join(_DIR, "movie_vectors.npz")
)



def recommend(movie: str):
    movie_row = movies[movies["title"].str.lower() == movie]

    if movie_row.empty:
        return None

    movie_index = movie_row.index[0]

    distances = cosine_similarity(
        movie_vectors[movie_index],
        movie_vectors
    ).flatten()

    movie_list = sorted(
        enumerate(distances),
        key=lambda x: x[1],
        reverse=True
    )[1:6]

    recommendations = []

    for index, _ in movie_list:
        movie_data = movies.iloc[index]

        recommendations.append(
            {
                "movie_id": int(movie_data.movie_id),
                "title": movie_data.title,
            }
        )

    return recommendations




async def fetch_poster(movie_id: int, client: httpx.AsyncClient):
    url = f"https://api.themoviedb.org/3/movie/{movie_id}"

    headers = {
        "Authorization": f"Bearer {settings.api_read_access_token}",
        "accept": "application/json",
    }

    try:
        response = await client.get(url, headers=headers)

        response.raise_for_status()

        data = response.json()

        poster_path = data.get("poster_path")

        if poster_path:
            return f"https://image.tmdb.org/t/p/w500{poster_path}"

        return None

    except httpx.HTTPStatusError as e:
        print(f"TMDB HTTP Error ({movie_id}): {e.response.status_code}")
        return None

    except Exception as e:
        print(f"TMDB Error ({movie_id}): {e}")
        return None




async def get_recommendations(movie: str):
    recommendations = recommend(movie)

    if recommendations is None:
        return None

    async with httpx.AsyncClient(timeout=10.0) as client:

        tasks = [
            fetch_poster(item["movie_id"], client)
            for item in recommendations
        ]

        posters = await asyncio.gather(*tasks)

    result = []

    for item, poster in zip(recommendations, posters):
        result.append(
            {
                "movie_id": item["movie_id"],
                "title": item["title"],
                "poster": poster,
            }
        )

    return result