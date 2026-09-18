import base64
from io import BytesIO

import qrcode


def generate_qr_code(data):
    """
    Generate a QR code image as a Base64 string.

    Parameters
    ----------
    data : str
        Text or URL to encode in the QR code.

    Returns
    -------
    str
        Base64 encoded PNG image.
    """

    if not data:
        raise ValueError(
            "QR code data cannot be empty."
        )

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )

    qr.add_data(data)
    qr.make(fit=True)

    image = qr.make_image()

    buffer = BytesIO()

    image.save(
        buffer,
        format="PNG"
    )

    image_bytes = buffer.getvalue()

    return base64.b64encode(
        image_bytes
    ).decode("utf-8")