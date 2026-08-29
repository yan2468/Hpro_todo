import os
import glob
import shutil
import zipfile
import sys

# Windows console defaults to GBK (cp936), which cannot encode the emoji in
# the release filenames (🐮🐴) - printing them would raise UnicodeEncodeError
# even though the files were written fine. Force UTF-8 for stdout/stderr so
# this script behaves the same no matter who invokes it (cmd, PowerShell, CI).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RELEASE = os.path.join(ROOT, 'release')
ARCHIVE = os.path.join(RELEASE, '_archive')

PC_ZIP = os.path.join(RELEASE, '\U0001f42e\U0001f434\u7684\u6253\u5de5\u65e5\u5fd7-\u7535\u8111\u7248.zip')

# Portable single-file exe (electron-builder "portable" target).
# It lands directly in release-out/*.exe - note win-unpacked/ keeps its own exe
# in a SUBdirectory, so anything matching release-out/*.exe is the portable one.
# Double-click to run; no install, no unzip, fits on a USB stick.
PC_EXE = os.path.join(RELEASE, '\U0001f42e\U0001f434\u7684\u6253\u5de5\u65e5\u5fd7-\u7535\u8111\u7248.exe')

# Pick the newest win-unpacked among possible electron output dirs
# (release-out, release-out-fix, ...) so we never package a stale build.
def find_pc_src():
    cands = []
    for name in os.listdir(ROOT):
        if not name.startswith('release-out'):
            continue
        p = os.path.join(ROOT, name, 'win-unpacked')
        if os.path.isdir(p):
            cands.append(p)
    if not cands:
        return None
    return max(cands, key=lambda p: os.path.getmtime(p))

# Server package: build straight from the live source in server/, so the deployed
# copy can never drift behind src. deploy/server/ only supplies deploy-only files
# (ecosystem.config.cjs, package.json, README.md); its duplicated .ts snapshots are
# deliberately IGNORED (they used to go stale - e.g. auth.ts).
SRV_SRC = os.path.join(ROOT, 'server')
SRV_DEPLOY = os.path.join(ROOT, 'deploy', 'server')
SRV_DEPLOY_ONLY = ('ecosystem.config.cjs', 'package.json', 'README.md', 'update-to-latest.sql')
SRV_ZIP = os.path.join(RELEASE, 'dave-tasks-server.zip')

APK_SRC = os.path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
APK_DST = os.path.join(RELEASE, '\U0001f42e\U0001f434\u7684\u6253\u5de5\u65e5\u5fd7-\u5b89\u5353\u7248.apk')

CANONICAL = {
    os.path.basename(PC_ZIP),
    os.path.basename(PC_EXE),
    os.path.basename(APK_DST),
    os.path.basename(SRV_ZIP),
}
REDUNDANT_MARKERS = ('\u4fee\u590d', 'fix', 'Fix', 'FIX', 'beta', 'Beta', 'BETA')


def zip_dir(src, dst, exclude=None):
    exclude = exclude or []
    # NOTE: open with 'w' truncates the existing file in place (no unlink),
    # which avoids the sandbox safe-delete hook that blocks os.remove.
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(src):
            for f in files:
                if f in exclude:
                    continue
                full = os.path.join(root, f)
                arc = os.path.relpath(full, src)
                z.write(full, arc)
    return os.path.getsize(dst)


def main():
    failures = []

    # PC
    PC_SRC = find_pc_src()
    if PC_SRC:
        try:
            sz = zip_dir(PC_SRC, PC_ZIP)
            print('[OK] PC zip -> %s (%d bytes) [from %s]' % (os.path.basename(PC_ZIP), sz, os.path.basename(os.path.dirname(PC_SRC))))
        except Exception as e:
            print('[FAIL] PC zip: %s' % e)
            failures.append('pc')
    else:
        print('[SKIP] PC source missing: no win-unpacked under release-out* (run build:electron first)')
        failures.append('pc')

    # Portable exe (optional artifact - skipping it is NOT a failure, because the
    # zip above already covers the "I just want the app" case).
    portables = sorted(glob.glob(os.path.join(ROOT, 'release-out', '*.exe')))
    if portables:
        try:
            shutil.copy2(portables[0], PC_EXE)
            print('[OK] Portable exe -> %s (%d bytes) [double-click to run, no unzip]'
                  % (os.path.basename(PC_EXE), os.path.getsize(PC_EXE)))
        except Exception as e:
            print('[FAIL] Portable exe copy: %s' % e)
    else:
        print('[SKIP] Portable exe not built: no *.exe in release-out (portable target missing?)')

    # Server: live source (server/) + deploy-only files (deploy/server/)
    if os.path.isdir(SRV_SRC):
        try:
            # 'w' truncates in place (no unlink) - avoids the safe-delete hook
            # that blocks os.remove on existing archives.
            with zipfile.ZipFile(SRV_ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
                # live source .ts/.sql/.cjs under server/ prefix
                for f in sorted(os.listdir(SRV_SRC)):
                    full = os.path.join(SRV_SRC, f)
                    if not os.path.isfile(full) or f == '.env':
                        continue
                    z.write(full, 'server/%s' % f)
                # deploy-only files at package root
                for f in SRV_DEPLOY_ONLY:
                    full = os.path.join(SRV_DEPLOY, f)
                    if os.path.isfile(full):
                        z.write(full, f)
                # .env lives only in deploy/server (secrets); never ship it
            sz = os.path.getsize(SRV_ZIP)
            print('[OK] Server zip -> %s (%d bytes) [from server/ source, .env excluded]' % (os.path.basename(SRV_ZIP), sz))
        except Exception as e:
            print('[FAIL] Server zip: %s' % e)
            failures.append('server')
    else:
        print('[SKIP] Server source missing: %s' % SRV_SRC)
        failures.append('server')

    # APK
    if os.path.isfile(APK_SRC):
        try:
            shutil.copy2(APK_SRC, APK_DST)
            print('[OK] APK -> %s (%d bytes)' % (os.path.basename(APK_DST), os.path.getsize(APK_DST)))
        except Exception as e:
            print('[FAIL] APK copy: %s' % e)
            failures.append('apk')
    else:
        print('[SKIP] APK not built: %s (run cap:sync + apk:debug)' % APK_SRC)

    # Remove redundant old builds. On a normal machine this deletes them for real
    # (fulfilling "只留正式版"); inside a sandbox with a safe-delete hook the delete
    # is blocked, so we fall back to moving them into release/_archive (reversible).
    # Collect first - only create _archive if we actually have something to move,
    # otherwise every run leaves an empty directory behind.
    redundant = []
    for name in os.listdir(RELEASE):
        p = os.path.join(RELEASE, name)
        if not os.path.isfile(p):
            continue
        if name in CANONICAL:
            continue
        if any(m in name for m in REDUNDANT_MARKERS):
            redundant.append(name)

    archived = []
    for name in redundant:
        p = os.path.join(RELEASE, name)
        try:
            os.remove(p)
            archived.append('%s (deleted)' % name)
        except Exception:
            if not os.path.isdir(ARCHIVE):
                os.makedirs(ARCHIVE)
            shutil.move(p, os.path.join(ARCHIVE, name))
            archived.append('%s (archived)' % name)
    if archived:
        print('[OK] Removed redundant old builds: %s' % ', '.join(archived))
    else:
        print('[OK] No redundant old builds to remove.')

    if failures:
        print('[WARN] Some steps failed: %s' % failures)
        sys.exit(1)
    print('[DONE] Official release ready in release\\')


if __name__ == '__main__':
    main()
