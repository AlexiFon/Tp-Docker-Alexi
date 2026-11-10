import os
from flask import Flask
from pymongo import MongoClient

app = Flask(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(MONGO_URI)

@app.route('/')
def index():
    try:
        client.admin.command('ping')
        return "Connexion à MongoDB réussie avec succès !"
    except Exception as e:
        return f"Échec de la connexion à MongoDB : {e}"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)