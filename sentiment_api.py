from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

# Initialize Flask app
app = Flask(__name__)

# Load pre-trained model and tokenizer
tokenizer = AutoTokenizer.from_pretrained("taufiqdp/indonesian-sentiment")
model = AutoModelForSequenceClassification.from_pretrained("taufiqdp/indonesian-sentiment")

# Define class names (sentiment labels)
class_names = ['negatif', 'netral', 'positif']

@app.route('/sentiment', methods=['POST'])
def analyze_sentiment():
    data = request.json
    review_text = data.get('reviewText', '')

    if not review_text:
        return jsonify({'error': 'No review text provided'}), 400

    # Tokenize the input review text
    tokenized_text = tokenizer(review_text, return_tensors='pt')

    # Perform inference
    with torch.no_grad():
        logits = model(**tokenized_text).logits

    # Get sentiment prediction
    sentiment = class_names[logits.argmax(dim=1).item()]
    
    return jsonify({'sentiment': sentiment})

if __name__ == '__main__':
    app.run(port=5000)
