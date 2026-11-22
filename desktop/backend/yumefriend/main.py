from fastapi import FastAPI

from yumefriend import __version__

app = FastAPI()


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/version")
def version() -> dict[str, str | int]:
    return {
        "app": __version__,
        "python": __version__,
        "yumeCore": "0.1.0",
        "protocol": 1,
    }
