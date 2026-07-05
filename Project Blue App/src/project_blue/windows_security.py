from __future__ import annotations

import ctypes
import os
from ctypes import wintypes


class DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_byte)),
    ]


def _input_blob(data: bytes) -> tuple[DataBlob, ctypes.Array]:
    buffer = ctypes.create_string_buffer(data)
    blob = DataBlob(
        len(data),
        ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)),
    )
    return blob, buffer


def _crypt32():
    if os.name != "nt":
        raise RuntimeError("The Phase 1.7 secret vault requires Windows DPAPI.")
    library = ctypes.windll.crypt32
    library.CryptProtectData.argtypes = [
        ctypes.POINTER(DataBlob),
        wintypes.LPCWSTR,
        ctypes.POINTER(DataBlob),
        wintypes.LPVOID,
        wintypes.LPVOID,
        wintypes.DWORD,
        ctypes.POINTER(DataBlob),
    ]
    library.CryptUnprotectData.argtypes = [
        ctypes.POINTER(DataBlob),
        ctypes.POINTER(wintypes.LPWSTR),
        ctypes.POINTER(DataBlob),
        wintypes.LPVOID,
        wintypes.LPVOID,
        wintypes.DWORD,
        ctypes.POINTER(DataBlob),
    ]
    return library


def protect(data: bytes, entropy: bytes = b"ProjectBlue") -> bytes:
    library = _crypt32()
    source, source_buffer = _input_blob(data)
    entropy_blob, entropy_buffer = _input_blob(entropy)
    output = DataBlob()
    if not library.CryptProtectData(
        ctypes.byref(source),
        "Project Blue secret",
        ctypes.byref(entropy_blob),
        None,
        None,
        0x1,
        ctypes.byref(output),
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(output.pbData, output.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(output.pbData)


def unprotect(data: bytes, entropy: bytes = b"ProjectBlue") -> bytes:
    library = _crypt32()
    source, source_buffer = _input_blob(data)
    entropy_blob, entropy_buffer = _input_blob(entropy)
    output = DataBlob()
    description = wintypes.LPWSTR()
    if not library.CryptUnprotectData(
        ctypes.byref(source),
        ctypes.byref(description),
        ctypes.byref(entropy_blob),
        None,
        None,
        0x1,
        ctypes.byref(output),
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(output.pbData, output.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(output.pbData)
        if description:
            ctypes.windll.kernel32.LocalFree(description)
