import os
import shutil

import imageio_ffmpeg

# gemini_client shells out to the literal command "ffmpeg" to convert the
# browser's webm recording to wav, so it needs to be on PATH under that exact
# name -- an absolute path would do for our own calls, but keeping the name
# resolvable also covers anything else that expects it. imageio-ffmpeg
# ships a static binary so we don't need a system-wide FFmpeg install, but its
# file is named e.g. "ffmpeg-win-x86_64-v7.1.exe" — on Windows, the process
# launcher matches PATH entries by exact filename (no PATHEXT guessing like
# cmd.exe does), so simply adding its directory to PATH isn't enough. We copy
# it once into our own bin dir under the exact name "ffmpeg.exe" and put that
# dir on PATH instead.
_bin_dir = os.path.join(os.path.dirname(__file__), "..", "..", ".bin")
os.makedirs(_bin_dir, exist_ok=True)
_ffmpeg_alias = os.path.join(_bin_dir, "ffmpeg.exe")
if not os.path.exists(_ffmpeg_alias):
    shutil.copy2(imageio_ffmpeg.get_ffmpeg_exe(), _ffmpeg_alias)

os.environ.setdefault("PATH", "")
if _bin_dir not in os.environ["PATH"]:
    os.environ["PATH"] = _bin_dir + os.pathsep + os.environ["PATH"]
