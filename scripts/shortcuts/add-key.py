"""
Turns a compiled shortcut's "PH_KEY" text into an install-time question, so
the file holds no secret: whoever adds it is asked for the site key.

    python3 add-key.py "1618 Status.plist" 1618-status.plist [--sign]

--sign signs it with RoutineHub's HubSign service (iPhones only import
signed shortcuts), writing 1618-status.shortcut next to it. HubSign only
answers known clients, so this identifies as Cherri, the compiler used.
"""
import json
import plistlib
import sys
import time
import urllib.request

src, out = sys.argv[1], sys.argv[2]
p = plistlib.load(open(src, "rb"))
idx = next(i for i, a in enumerate(p["WFWorkflowActions"])
           if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.gettext"
           and a["WFWorkflowActionParameters"].get("WFTextActionText") == "PH_KEY")
p["WFWorkflowActions"][idx]["WFWorkflowActionParameters"]["WFTextActionText"] = ""
p["WFWorkflowImportQuestions"] = [{
    "ActionIndex": idx, "Category": "Parameter", "DefaultValue": "", "ParameterKey": "WFTextActionText",
    "Text": "Paste your site key (ADMIN_SECRET from Vercel). It stays inside this shortcut on your phone."}]
xml = plistlib.dumps(p, fmt=plistlib.FMT_XML)
open(out, "wb").write(xml)
print(f"wrote {out} (key question on action {idx})")

if "--sign" in sys.argv:
    name = out.rsplit(".", 1)[0]
    req = urllib.request.Request("https://hubsign.routinehub.services/sign",
                                 data=json.dumps({"shortcutName": name, "shortcut": xml.decode()}).encode(),
                                 headers={"Content-Type": "application/json", "User-Agent": "cherri/2.3.0"})
    # HubSign sometimes says no for a moment; try a few times, backing off.
    signed = b""
    for attempt in range(5):
        try:
            signed = urllib.request.urlopen(req, timeout=60).read()
        except Exception:
            signed = b""
        if signed[:4] == b"AEA1":
            break
        time.sleep(5 * (attempt + 1))
    if signed[:4] != b"AEA1":
        sys.exit("signing failed")
    open(f"{name}.shortcut", "wb").write(signed)
    print(f"wrote {name}.shortcut ({len(signed)} bytes, signed)")
