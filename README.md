# Guardabosque

Guardabosque is an offline nature guide for people exploring Tabasco, Mexico. It uses an open-weight Gemma model running locally through Ollama to identify a plant, bird, insect, or other organism from a phone photo, suggest what to observe, and create a short field mission that gets people walking again.

It is designed for parks, wetlands, forests, and neighborhoods where mobile coverage is unreliable. Photos stay on the local device and laptop, there is no service cost, and the model can be changed with `GUARDABOSQUE_MODEL`.

## Requirements

- Node.js 24 or newer
- [Ollama](https://ollama.com/) running on the laptop
- A Gemma model available locally

## Run it

```bash
ollama pull gemma4:e4b-it-qat
npm start
```

Open the printed network URL from a phone connected to the same Wi-Fi network or to a hotspot hosted by the phone or laptop. The laptop runs the server and Ollama; the phone is the field interface.

Useful configuration defaults are:

```text
PORT=3000
HOST=0.0.0.0
OLLAMA_URL=http://127.0.0.1:11434
GUARDABOSQUE_MODEL=gemma4:e4b-it-qat
DATA_DIR=./data
```

For example, `GUARDABOSQUE_MODEL=gemma3:4b npm start` selects another model already installed in Ollama.

## How to use it in the field

Choose **Identificar**, take a photo, and read the result. The app compresses the image locally before sending it to the laptop. Use **Misión** to choose a Tabasco place and a walk length, then check off observations as you go. **Mi diario** stores selected results and small thumbnails in the local `data/journal.json` file.

## API summary

- `GET /api/health` reports the configured model and whether Ollama answers.
- `GET /api/places` lists the available Tabasco places.
- `POST /api/identify` accepts `{ image, note? }` and returns a normalized identification.
- `POST /api/quest` accepts `{ placeId?, minutes? }` and returns a normalized field mission.
- `GET /api/journal`, `POST /api/journal`, and `DELETE /api/journal/:id` manage the local field journal.

Requests and responses are JSON. Images are limited by the server, and journal thumbnails are limited to 200 KB.

## Honest limits

This is an observation aid, not a scientific field guide or a medical safety system. Model output can be wrong. Do not touch, taste, feed, or approach wildlife. Treat warnings seriously, respect park rules, and ask local experts to verify dangerous or uncertain species.

## License

MIT. See [LICENSE](LICENSE).
