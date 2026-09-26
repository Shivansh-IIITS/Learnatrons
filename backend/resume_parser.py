"""
Resume parser — extracts text from PDF uploads using pdfplumber.
"""
import pdfplumber
import io


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract all text from a PDF file given its raw bytes."""
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    
    full_text = "\n\n".join(text_parts)
    
    if not full_text.strip():
        raise ValueError("Could not extract any text from the PDF. The file may be image-based or empty.")
    
    return full_text.strip()
