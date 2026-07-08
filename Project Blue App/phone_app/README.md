# Project Blue Phone App

This builds a small Android APK that connects to the Project Blue phone bridge running on the PC.

## Build

Run:

```cmd
build_apk.cmd
```

APK output:

```text
app\build\outputs\apk\debug\app-debug.apk
```

## Use

1. Open Project Blue on the PC.
2. Go to `System > Safe PC Help`.
3. Click `Start Phone Bridge`.
4. Install the APK on the phone.
5. Enter the phone bridge URL. If the PC has tokenless bridge mode off, also enter the pairing token.

This app can chat with Blue and answer queued approval questions. It does not provide raw unrestricted PC control.
