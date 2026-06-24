from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import DESCENDING, MongoClient
from pymongo.errors import PyMongoError
import datetime
import os


app = Flask(__name__, static_folder="static", static_url_path="/")
CORS(app)

MONGO_URI = os.getenv("MONGODB_URI") or os.getenv("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "recursos_hidricos")
MONGO_COLLECTION_NAME = os.getenv("MONGO_COLLECTION_NAME") or os.getenv(
    "MONGO_COLLECTION", "sensor_data"
)

mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
sensor_collection = mongo_client[MONGO_DB_NAME][MONGO_COLLECTION_NAME]


def init_db():
    try:
        sensor_collection.create_index([("timestamp", DESCENDING)])
    except PyMongoError as exc:
        print(f"Aviso: nao foi possivel inicializar indices do MongoDB: {exc}")


def serialize_document(document):
    serialized = dict(document)
    serialized["id"] = str(serialized.pop("_id"))
    return serialized


def database_error_response(exc):
    print(f"Erro ao acessar MongoDB: {exc}")
    return jsonify({"status": "error", "message": "Erro ao acessar MongoDB"}), 503


# Initialize database indexes on startup.
init_db()


@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/api/data", methods=["POST"])
def receive_data():
    data = request.get_json()
    if data is None:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400

    required_fields = ["nivel_cm", "percentual"]
    for field in required_fields:
        if field not in data:
            return jsonify({"status": "error", "message": f"Missing field: {field}"}), 400

    timestamp_str = datetime.datetime.now().isoformat()
    document = {
        "sensor_id": data.get("sensor_id", "unknown"),
        "nivel_cm": data.get("nivel_cm", 0),
        "capacidade_cm": data.get("capacidade_cm", 100),
        "percentual": data.get("percentual", 0),
        "volume_litros": data.get("volume_litros", 0),
        "timestamp": timestamp_str,
    }

    try:
        result = sensor_collection.insert_one(document)
    except PyMongoError as exc:
        return database_error_response(exc)

    print(f"Dados inseridos no MongoDB com ID: {result.inserted_id}")
    return jsonify({"status": "success", "data_received": serialize_document(document)}), 201


@app.route("/api/latest", methods=["GET"])
def get_latest_data():
    try:
        document = sensor_collection.find_one(sort=[("timestamp", DESCENDING)])
    except PyMongoError as exc:
        return database_error_response(exc)

    if document:
        return jsonify(serialize_document(document)), 200

    return jsonify({"message": "Nenhum dado encontrado"}), 404


@app.route("/api/history", methods=["GET"])
def get_history():
    hours = request.args.get("hours", 24, type=int)
    limit = request.args.get("limit", 500, type=int)
    since = (datetime.datetime.now() - datetime.timedelta(hours=hours)).isoformat()

    try:
        cursor = (
            sensor_collection.find({"timestamp": {"$gte": since}})
            .sort("timestamp", DESCENDING)
            .limit(limit)
        )
        data_list = [serialize_document(document) for document in cursor]
    except PyMongoError as exc:
        return database_error_response(exc)

    return jsonify(data_list), 200


@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    try:
        document = sensor_collection.find_one(
            projection={"percentual": True},
            sort=[("timestamp", DESCENDING)],
        )
    except PyMongoError as exc:
        return database_error_response(exc)

    alerts = []
    if document:
        percentual = document.get("percentual", 0)
        if percentual < 20:
            alerts.append(
                {
                    "type": "critical",
                    "message": "Nivel de agua criticamente baixo (abaixo de 20%).",
                }
            )
        elif percentual < 50:
            alerts.append(
                {"type": "warning", "message": "Nivel de agua baixo (abaixo de 50%)."}
            )

    return jsonify(alerts), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
