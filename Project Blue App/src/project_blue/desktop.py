from __future__ import annotations

import json
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext

from project_blue import __version__
from project_blue.core import BlueCore


class BlueDesktop:
    def __init__(self, core: BlueCore, session_title: str) -> None:
        self.core = core
        activation = core.activate_session(session_title)
        self.conversation_id = activation["conversation_id"]
        self.root = tk.Tk()
        self.root.title(f"Project Blue v{__version__}")
        self.root.geometry("760x640")
        self.root.minsize(560, 460)
        self.root.configure(bg="#07111f")
        self.root.protocol("WM_DELETE_WINDOW", self.close)

        header = tk.Frame(self.root, bg="#102238", padx=18, pady=14)
        header.pack(fill="x")
        avatar_path = Path(__file__).parent / "data" / "blue_avatar.png"
        self.avatar = tk.PhotoImage(file=str(avatar_path)).subsample(3, 3)
        tk.Label(
            header, image=self.avatar, bg="#102238", bd=2,
            relief="solid", highlightthickness=0
        ).pack(side="left")
        title = tk.Frame(header, bg="#102238")
        title.pack(side="left", padx=12)
        tk.Label(
            title, text="BLUE", bg="#102238", fg="#eaf4ff",
            font=("Segoe UI", 22, "bold")
        ).pack(anchor="w")
        provider = activation["provider"]
        tk.Label(
            title,
            text=f"{session_title} · {provider['provider']} · active",
            bg="#102238", fg="#73e2a7", font=("Segoe UI", 10)
        ).pack(anchor="w")

        self.transcript = scrolledtext.ScrolledText(
            self.root, wrap="word", bg="#081625", fg="#eaf4ff",
            insertbackground="#eaf4ff", font=("Segoe UI", 11),
            relief="flat", padx=14, pady=14, state="disabled"
        )
        self.transcript.pack(fill="both", expand=True, padx=16, pady=(16, 8))
        self.write(
            "blue",
            "I’m Blue, an AI. I’m active on your PC. Talk to me, choose a file "
            "for me to learn, or use /make WORKSPACE | TEMPLATE | FILE.",
        )

        controls = tk.Frame(self.root, bg="#07111f", padx=16, pady=10)
        controls.pack(fill="x")
        self.entry = tk.Entry(
            controls, bg="#102238", fg="#eaf4ff", insertbackground="#eaf4ff",
            relief="flat", font=("Segoe UI", 11)
        )
        self.entry.pack(side="left", fill="x", expand=True, ipady=10)
        self.entry.bind("<Return>", lambda _event: self.send())
        tk.Button(
            controls, text="Send", command=self.send, bg="#1672b8",
            fg="white", relief="flat", padx=18, pady=9
        ).pack(side="left", padx=(8, 0))
        tk.Button(
            controls, text="Learn File", command=self.learn_file, bg="#245274",
            fg="white", relief="flat", padx=14, pady=9
        ).pack(side="left", padx=(8, 0))
        self.entry.focus_set()

    def write(self, speaker: str, text: str) -> None:
        self.transcript.configure(state="normal")
        self.transcript.insert("end", f"{speaker}> {text}\n\n")
        self.transcript.configure(state="disabled")
        self.transcript.see("end")

    def learn_file(self) -> None:
        selected = filedialog.askopenfilename(
            title="Choose trusted information for Blue to learn"
        )
        if not selected:
            return
        try:
            source_id = self.core.add_source(Path(selected))
            self.write("blue", f"Learned that file with provenance: {source_id}")
        except Exception as exc:
            messagebox.showerror("Blue could not learn this file", str(exc))

    def send(self) -> None:
        message = self.entry.get().strip()
        if not message:
            return
        self.entry.delete(0, "end")
        self.write("you", message)
        self.entry.configure(state="disabled")
        threading.Thread(target=self._respond, args=(message,), daemon=True).start()

    def _respond(self, message: str) -> None:
        try:
            if message.startswith("/make "):
                parts = [part.strip() for part in message[6:].split("|")]
                if len(parts) != 3:
                    raise ValueError("Use: /make WORKSPACE | TEMPLATE | RELATIVE_PATH")
                result = self.core.forge_template(*parts)
                response = (
                    "Draft created. Approval is required before any project write.\n"
                    + json.dumps(result, indent=2)
                )
            elif message.startswith("/academy "):
                response = self.core.academy_ask(message[9:].strip())["answer"]
            elif message.startswith("/lesson "):
                result = self.core.academy_create_lesson(message[8:].strip())
                response = f"Cited lesson created: {result['lesson_id']}"
            else:
                response, _decision = self.core.conversation_chat(
                    self.conversation_id, message
                )
        except Exception as exc:
            response = f"I couldn’t complete that: {exc}"
        self.root.after(0, self._finish_response, response)

    def _finish_response(self, response: str) -> None:
        self.write("blue", response)
        self.entry.configure(state="normal")
        self.entry.focus_set()

    def close(self) -> None:
        self.core.close()
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def run_desktop(core: BlueCore, session_title: str = "Blue Desktop") -> None:
    BlueDesktop(core, session_title).run()
