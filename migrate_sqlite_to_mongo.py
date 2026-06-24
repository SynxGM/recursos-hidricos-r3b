import os
import sqlite3

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import PyMongoError


SQLITE_PATH = os.getenv("SQLITE_PATH", "iot_database.db")
MONGO_URI = os.getenv("MONGODB_URI") or os.getenv("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "recursos_hidricos")
MONGO_COLLECTION_NAME = os.getenv("MONGO_COLLECTION_NAME") or os.getenv(
    "MONGO_COLLECTION", "sensor_data"
)


def read_sqlite_rows():
    if not os.path.exists(SQLITE_PATH):
        raise FileNotFoundError(f"Arquivo SQLite nao encontrado: {SQLITE_PATH}")

    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT * FROM sensor_data ORDER BY id ASC").fetchall()
    finally:
        conn.close()

    return rows


def row_to_document(row):
    document = dict(row)
    document["legacy_sqlite_id"] = document.pop("id")
    return document


def main():
    rows = read_sqlite_rows()
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    collection = client[MONGO_DB_NAME][MONGO_COLLECTION_NAME]

    try:
        collection.create_index([("timestamp", DESCENDING)])
        collection.create_index([("legacy_sqlite_id", ASCENDING)], unique=True, sparse=True)

        inserted = 0
        skipped = 0
        for row in rows:
            document = row_to_document(row)
            result = collection.update_one(
                {"legacy_sqlite_id": document["legacy_sqlite_id"]},
                {"$setOnInsert": document},
                upsert=True,
            )
            if result.upserted_id:
                inserted += 1
            else:
                skipped += 1
    except PyMongoError as exc:
        raise SystemExit(f"Erro ao migrar para MongoDB: {exc}") from exc

    print(f"Migracao concluida. Inseridos: {inserted}. Ja existiam: {skipped}.")


if __name__ == "__main__":
    main()
