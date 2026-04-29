from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
import random
import hashlib
from datetime import datetime

app = Flask(__name__)
CORS(app)

DB_FILE = 'backend_db.json'

def load_db():
    if not os.path.exists(DB_FILE):
        return [
            {
                "id": "NYV-1001",
                "hash": "a1b2c3d4",
                "category": "Water",
                "text": "No water for 3 days in block A.",
                "status": "Pending",
                "upvotes": 12,
                "date": datetime.utcnow().isoformat() + "Z"
            },
            {
                "id": "NYV-1002",
                "hash": "e5f6g7h8",
                "category": "Safety",
                "text": "Streetlights broken on main road.",
                "status": "Resolved",
                "upvotes": 45,
                "date": datetime.utcnow().isoformat() + "Z"
            }
        ]
    with open(DB_FILE, 'r') as f:
        return json.load(f)

def save_db(data):
    with open(DB_FILE, 'w') as f:
        json.dump(data, f, indent=4)

@app.route('/api/complaints', methods=['GET'])
def get_complaints():
    return jsonify(load_db())

@app.route('/api/complaints', methods=['POST'])
def create_complaint():
    data = request.json
    db = load_db()
    
    new_id = f"NYV-{random.randint(1000, 9999)}"
    text = data.get('text', '')
    category = data.get('category', 'Other')
    
    # Generate a simple hash
    hash_str = hashlib.sha256((new_id + text).encode()).hexdigest()[:8]
    
    new_complaint = {
        "id": new_id,
        "hash": hash_str,
        "category": category,
        "text": text,
        "status": "Pending",
        "upvotes": 1,
        "date": datetime.utcnow().isoformat() + "Z"
    }
    
    db.insert(0, new_complaint)
    save_db(db)
    
    return jsonify(new_complaint), 201

@app.route('/api/complaints/<id>/status', methods=['PUT'])
def update_status(id):
    db = load_db()
    for item in db:
        if item['id'] == id:
            item['status'] = 'Resolved' if item['status'] == 'Pending' else 'Pending'
            save_db(db)
            return jsonify(item)
    return jsonify({"error": "Not found"}), 404

if __name__ == '__main__':
    # Initialize DB file if not exists
    if not os.path.exists(DB_FILE):
        save_db(load_db())
    app.run(debug=True, port=5001)
