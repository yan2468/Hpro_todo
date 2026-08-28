import zipfile
import os

pc_src = 'release-out/win-unpacked'
pc_zip = 'release/🐮🐴的打工日志-电脑版.zip'
if os.path.exists(pc_zip):
    os.remove(pc_zip)
with zipfile.ZipFile(pc_zip, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(pc_src):
        for f in files:
            full = os.path.join(root, f)
            arc = os.path.relpath(full, pc_src)
            z.write(full, arc)
print('pc zip:', pc_zip, os.path.getsize(pc_zip))

srv_src = 'deploy/server'
srv_zip = 'release/dave-tasks-server.zip'
if os.path.exists(srv_zip):
    os.remove(srv_zip)
with zipfile.ZipFile(srv_zip, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(srv_src):
        if '.env' in files:
            files.remove('.env')
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, srv_src)
            arc = os.path.join('dev-todo', rel).replace('\\', '/')
            z.write(full, arc)
print('server zip:', srv_zip, os.path.getsize(srv_zip))
