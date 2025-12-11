from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import whisper
import torch
import numpy as np
from werkzeug.utils import secure_filename
import os
import tempfile
import subprocess
import shutil
import threading
import queue
import time
import json

app = Flask(__name__)
CORS(app)

# Verificar si CUDA está disponible
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🚀 Usando dispositivo: {device}")

# Verificar si FFmpeg está instalado
def check_ffmpeg():
    try:
        result = subprocess.run(
            ['ffmpeg', '-version'], 
            capture_output=True, 
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            version = result.stdout.split('\n')[0]
            print(f"✅ FFmpeg encontrado: {version}")
            return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        print("❌ FFmpeg no encontrado")
        return False
    return False

ffmpeg_available = check_ffmpeg()

# Cargar el modelo Whisper
print("📥 Cargando modelo Whisper...")
try:
    model = whisper.load_model("base", device=device)
    print("✅ Modelo Whisper cargado correctamente")
except Exception as e:
    print(f"❌ Error cargando modelo: {e}")
    model = None

# Cola para streaming
streaming_queue = queue.Queue()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok" if (model is not None and ffmpeg_available) else "error",
        "device": device,
        "cuda_available": torch.cuda.is_available(),
        "ffmpeg_available": ffmpeg_available,
        "model": "whisper-base" if model else None,
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    })

def convert_audio_to_wav(input_path, output_path):
    """
    Convierte cualquier formato de audio a WAV usando FFmpeg
    """
    if not ffmpeg_available:
        raise Exception("FFmpeg no está instalado. Por favor instálalo primero.")
    
    try:
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-ar', '16000',
            '-ac', '1',
            '-c:a', 'pcm_s16le',
            '-y',
            output_path
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            raise Exception(f"Error en conversión FFmpeg: {result.stderr}")
        
        return True
    except subprocess.TimeoutExpired:
        raise Exception("Timeout en conversión de audio")
    except Exception as e:
        raise Exception(f"Error convirtiendo audio: {str(e)}")

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if not model:
        return jsonify({"error": "Modelo no disponible"}), 500
    
    if not ffmpeg_available:
        return jsonify({
            "error": "FFmpeg no está instalado. Instálalo con: sudo apt install ffmpeg (Linux) o choco install ffmpeg (Windows)"
        }), 500
    
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "No se encontró el archivo de audio"}), 400
        
        audio_file = request.files['audio']
        language = request.form.get('language', 'es')
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_input:
            audio_file.save(temp_input.name)
            input_path = temp_input.name
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_output:
            output_path = temp_output.name
        
        try:
            print(f"🔄 Convirtiendo audio a WAV...")
            convert_audio_to_wav(input_path, output_path)
            
            print(f"🎤 Transcribiendo audio...")
            result = model.transcribe(
                output_path,
                language=language,
                fp16=(device == "cuda"),
                verbose=False,
                task='transcribe'
            )
            
            text = result['text'].strip()
            print(f"✅ Transcripción completada: {text[:50]}...")
            
            return jsonify({
                "success": True,
                "text": text,
                "language": result['language'],
                "segments": [
                    {
                        "start": seg['start'],
                        "end": seg['end'],
                        "text": seg['text'].strip()
                    }
                    for seg in result['segments']
                ]
            })
        
        finally:
            for path in [input_path, output_path]:
                if os.path.exists(path):
                    try:
                        os.unlink(path)
                    except:
                        pass
    
    except Exception as e:
        print(f"❌ Error en transcripción: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/transcribe-streaming', methods=['POST'])
def transcribe_streaming():
    """
    Endpoint para transcripción en streaming - envía chunks mientras transcribe
    """
    if not model or not ffmpeg_available:
        return jsonify({"error": "Servicio no disponible"}), 500
    
    def generate():
        try:
            if 'audio' not in request.files:
                yield f"data: {json.dumps({'error': 'No se encontró el archivo de audio'})}\n\n"
                return
            
            audio_file = request.files['audio']
            language = request.form.get('language', 'es')
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_input:
                audio_file.save(temp_input.name)
                input_path = temp_input.name
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_output:
                output_path = temp_output.name
            
            try:
                # Convertir audio
                yield f"data: {json.dumps({'status': 'converting'})}\n\n"
                convert_audio_to_wav(input_path, output_path)
                
                # Transcribir
                yield f"data: {json.dumps({'status': 'transcribing'})}\n\n"
                
                result = model.transcribe(
                    output_path,
                    language=language,
                    fp16=(device == "cuda"),
                    verbose=False,
                    condition_on_previous_text=True,
                    temperature=0.0
                )
                
                # Enviar segmentos uno por uno
                for i, segment in enumerate(result['segments']):
                    text = segment['text'].strip()
                    if text:
                        yield f"data: {json.dumps({'chunk': text, 'index': i, 'start': segment['start'], 'end': segment['end']})}\n\n"
                        time.sleep(0.05)  # Pequeña pausa para simular streaming
                
                # Enviar texto completo al final
                yield f"data: {json.dumps({'complete': True, 'text': result['text'].strip()})}\n\n"
                
            finally:
                for path in [input_path, output_path]:
                    if os.path.exists(path):
                        try:
                            os.unlink(path)
                        except:
                            pass
        
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/transcribe-chunk', methods=['POST'])
def transcribe_chunk():
    """
    Procesa un chunk individual de audio (para grabación continua)
    """
    if not model or not ffmpeg_available:
        return jsonify({"error": "Servicio no disponible"}), 500
    
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "No se encontró el archivo de audio"}), 400
        
        audio_file = request.files['audio']
        language = request.form.get('language', 'es')
        chunk_index = request.form.get('chunk_index', '0')
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_input:
            audio_file.save(temp_input.name)
            input_path = temp_input.name
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_output:
            output_path = temp_output.name
        
        try:
            convert_audio_to_wav(input_path, output_path)
            
            # Transcribir con opciones optimizadas para chunks
            result = model.transcribe(
                output_path,
                language=language,
                fp16=(device == "cuda"),
                verbose=False,
                condition_on_previous_text=False,  # No usar contexto previo para chunks
                temperature=0.0,
                compression_ratio_threshold=2.4,
                logprob_threshold=-1.0,
                no_speech_threshold=0.6
            )
            
            text = result['text'].strip()
            
            return jsonify({
                "success": True,
                "text": text,
                "chunk_index": chunk_index,
                "has_speech": len(text) > 0
            })
        
        finally:
            for path in [input_path, output_path]:
                if os.path.exists(path):
                    try:
                        os.unlink(path)
                    except:
                        pass
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/languages', methods=['GET'])
def get_languages():
    """
    Devuelve la lista de idiomas soportados por Whisper
    """
    languages = {
        'es': 'Español',
        'en': 'English',
        'fr': 'Français',
        'de': 'Deutsch',
        'it': 'Italiano',
        'pt': 'Português',
        'ru': 'Русский',
        'ja': '日本語',
        'ko': '한국어',
        'zh': '中文'
    }
    return jsonify(languages)

if __name__ == '__main__':
    print("\n" + "="*60)
    print("🎙️  SERVIDOR DE TRANSCRIPCIÓN INICIADO")
    print("="*60)
    print(f"Dispositivo: {device}")
    print(f"CUDA disponible: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"Memoria GPU: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
    print(f"FFmpeg: {'✅ Instalado' if ffmpeg_available else '❌ No encontrado'}")
    print(f"Modelo: {'✅ Cargado' if model else '❌ Error'}")
    print(f"Streaming: ✅ Habilitado")
    
    if not ffmpeg_available:
        print("\n⚠️  ADVERTENCIA: FFmpeg no está instalado")
        print("Instala FFmpeg para que el servidor funcione correctamente:")
        print("  • Linux: sudo apt install ffmpeg")
        print("  • macOS: brew install ffmpeg")
        print("  • Windows: choco install ffmpeg")
    
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)