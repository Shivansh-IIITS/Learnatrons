"""
speaker.py — Standalone and utility speaker module using edge-tts and pygame.
Provides ultra-realistic neural TTS (en-US-JennyNeural / en-US-AriaNeural).
"""
import asyncio
import os
import edge_tts
import pygame

async def speak(text: str, voice: str = "en-US-JennyNeural", rate: str = "-3%"):
    """Generate and play speech audio using edge-tts and pygame."""
    tts = edge_tts.Communicate(
        text,
        voice=voice,
        rate=rate,
        volume="+0%",
        pitch="+0Hz"
    )
    output_path = os.path.join(os.path.dirname(__file__), "output.mp3")
    await tts.save(output_path)

    try:
        pygame.mixer.init()
        pygame.mixer.music.load(output_path)
        pygame.mixer.music.play()

        while pygame.mixer.music.get_busy():
            await asyncio.sleep(0.1)

        pygame.mixer.quit()
    except Exception as e:
        print(f"[Speaker Audio Device Warning] Could not play directly via pygame: {e}")
        # Audio file is still saved successfully for web/browser streaming
    return output_path

async def generate_speech_bytes(text: str, voice: str = "en-US-JennyNeural", rate: str = "-3%") -> bytes:
    """Generate audio bytes directly in memory for web streaming."""
    tts = edge_tts.Communicate(
        text,
        voice=voice,
        rate=rate,
        volume="+0%",
        pitch="+0Hz"
    )
    audio_data = bytearray()
    async for chunk in tts.stream():
        if chunk["type"] == "audio":
            audio_data.extend(chunk["data"])
    return bytes(audio_data)

if __name__ == "__main__":
    asyncio.run(speak("Good Afternoon, I will be taking your interview, please unmute yourself"))
