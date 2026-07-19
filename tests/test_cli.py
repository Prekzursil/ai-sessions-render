"""The `aisr` console entry point, end-to-end over SYNTHETIC fixtures.

These are the contract tests for the installed package: `pip install ai-sessions-render`
must give a working `aisr <provider> <src> <out>`. Fixtures mirror each provider's real
schema but contain no real conversation content.
"""
import json
import os

from aisr import cli


def _write(path, obj):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh)


def _claude_export():
    def msg(u, parent, sender, text, ts):
        return {"uuid": u, "parent_message_uuid": parent, "sender": sender, "created_at": ts,
                "content": [{"type": "text", "text": text, "citations": []}],
                "attachments": [], "files": [], "text": ""}
    return [{"uuid": "c1", "name": "Chat A", "created_at": "2025-01-01T00:00:00Z",
             "updated_at": "2025-01-02T00:00:00Z", "account": {"uuid": "acc1"},
             "chat_messages": [msg("m1", None, "human", "hello", "2025-01-01T00:00:01Z"),
                               msg("m2", "m1", "assistant", "hi there", "2025-01-01T00:00:02Z")]}]


def _chatgpt_export():
    return [{"title": "CG A", "conversation_id": "a", "create_time": 1.0, "current_node": "n2",
             "mapping": {
                 "n0": {"id": "n0", "message": None, "parent": None, "children": ["n1"]},
                 "n1": {"id": "n1", "parent": "n0", "children": ["n2"],
                        "message": {"id": "n1", "author": {"role": "user"}, "create_time": 1.0,
                                    "content": {"content_type": "text", "parts": ["hello"]},
                                    "metadata": {}}},
                 "n2": {"id": "n2", "parent": "n1", "children": [],
                        "message": {"id": "n2", "author": {"role": "assistant"}, "create_time": 2.0,
                                    "content": {"content_type": "text", "parts": ["hi there"]},
                                    "metadata": {}}}}}]


def _gemini_records():
    return [{"verb": "Prompted", "prompt": "hello", "response_md": "hi there",
             "timestamp_iso": "2026-01-01T10:00:00", "gem": None,
             "attachments": [], "media": [], "title": "", "detail": ""}]


def test_no_command_returns_usage_exit_code():
    assert cli.main([]) == 2


def test_demo_writes_a_self_contained_html(tmp_path):
    out = str(tmp_path / "demo.html")
    assert cli.main(["demo", out]) == 0
    doc = open(out, encoding="utf-8").read()
    assert doc.lstrip().lower().startswith("<!doctype html")


def test_claude_end_to_end(tmp_path):
    src = str(tmp_path / "claude.json")
    _write(src, _claude_export())
    out = str(tmp_path / "site")
    assert cli.main(["claude", src, out]) == 0
    assert os.path.isfile(os.path.join(out, "index.html"))
    assert len(os.listdir(os.path.join(out, "html"))) == 1
    md = os.listdir(os.path.join(out, "md"))
    body = open(os.path.join(out, "md", md[0]), encoding="utf-8").read()
    assert "hello" in body and "hi there" in body


def test_claude_accepts_a_directory_of_exports(tmp_path):
    d = tmp_path / "exports"
    d.mkdir()
    _write(str(d / "a.json"), _claude_export())
    out = str(tmp_path / "site")
    assert cli.main(["claude", str(d), out]) == 0
    assert len(os.listdir(os.path.join(out, "html"))) == 1


def test_claude_directory_skips_metadata_but_keeps_design_chats(tmp_path):
    """A Claude export directory also holds users.json / memories.json /
    projects/*.json — NOT conversations; ingesting them padded a real corpus with
    ~30 empty entries. design_chats/*.json ARE real conversations (different shape)
    and must still be rendered."""
    d = tmp_path / "acct"
    d.mkdir()
    _write(str(d / "conversations.json"), _claude_export())
    _write(str(d / "users.json"), {"uuid": "u1", "full_name": "someone"})
    _write(str(d / "memories.json"), {"uuid": "m1", "summary": "x"})
    (d / "projects").mkdir()
    _write(str(d / "projects" / "p1.json"), {"uuid": "p1", "name": "a project"})
    (d / "design_chats").mkdir()
    _write(str(d / "design_chats" / "dc1.json"),
           {"uuid": "dc1", "title": "A design chat",
            "messages": [{"uuid": "m1", "role": "user", "content": {"content": "design me"}}]})

    out = str(tmp_path / "site")
    assert cli.main(["claude", str(tmp_path), out]) == 0
    names = sorted(os.listdir(os.path.join(out, "html")))
    assert len(names) == 2                                   # conversation + design chat
    bodies = "".join(open(os.path.join(out, "html", n), encoding="utf-8").read() for n in names)
    assert "design me" in bodies and "hi there" in bodies
    assert "a project" not in bodies and "someone" not in bodies


def test_claude_directory_without_conversations_json_falls_back_to_any_json(tmp_path):
    """A renamed/single export must still work — the filter is a preference, not a trap."""
    d = tmp_path / "acct"
    d.mkdir()
    _write(str(d / "my-claude-export.json"), _claude_export())
    out = str(tmp_path / "site")
    assert cli.main(["claude", str(tmp_path), out]) == 0
    assert len(os.listdir(os.path.join(out, "html"))) == 1


def test_chatgpt_end_to_end(tmp_path):
    src = str(tmp_path / "cg.json")
    _write(src, _chatgpt_export())
    out = str(tmp_path / "site")
    assert cli.main(["chatgpt", src, out]) == 0
    md = os.listdir(os.path.join(out, "md"))
    assert "hi there" in open(os.path.join(out, "md", md[0]), encoding="utf-8").read()


def test_chatgpt_project_tag_reaches_the_index(tmp_path):
    data = _chatgpt_export()
    data[0]["__project_id"] = "g-p-XYZ"
    src = str(tmp_path / "cg.json")
    _write(src, data)
    out = str(tmp_path / "site")
    assert cli.main(["chatgpt", src, out]) == 0
    assert "g-p-XYZ" in open(os.path.join(out, "index.html"), encoding="utf-8").read()


def test_chatgpt_dedupes_a_conversation_seen_twice(tmp_path):
    data = _chatgpt_export() + _chatgpt_export()      # same conversation_id twice
    src = str(tmp_path / "cg.json")
    _write(src, data)
    out = str(tmp_path / "site")
    assert cli.main(["chatgpt", src, out]) == 0
    assert len(os.listdir(os.path.join(out, "html"))) == 1


def test_gemini_provisional_grouping_is_labelled_as_such(tmp_path):
    src = str(tmp_path / "t.json")
    _write(src, _gemini_records())
    out = str(tmp_path / "site")
    assert cli.main(["gemini", src, out]) == 0
    rep = json.load(open(os.path.join(out, "_fidelity-report.json"), encoding="utf-8"))
    assert "PROVISIONAL" in rep["grouping_mode"]


def test_gemini_harvest_grouping_is_labelled_true(tmp_path):
    src = str(tmp_path / "t.json")
    _write(src, _gemini_records())
    harvest = str(tmp_path / "h.json")
    _write(harvest, [{"id": "g1", "title": "Real Title",
                      "turns": [{"role": "user", "text": "hello"}]}])
    out = str(tmp_path / "site")
    assert cli.main(["gemini", src, out, "--harvest", harvest]) == 0
    rep = json.load(open(os.path.join(out, "_fidelity-report.json"), encoding="utf-8"))
    assert "TRUE" in rep["grouping_mode"] and rep["harvest_matched_records"] == 1


def test_missing_input_is_a_clean_error_not_a_traceback(tmp_path):
    out = str(tmp_path / "site")
    assert cli.main(["claude", str(tmp_path / "nope.json"), out]) == 1


def test_malformed_json_is_reported_not_fatal(tmp_path):
    src = str(tmp_path / "bad.json")
    with open(src, "w", encoding="utf-8") as fh:
        fh.write("{not json")
    out = str(tmp_path / "site")
    rc = cli.main(["claude", src, out])
    assert rc == 0                                     # reported, not a crash
    rep = json.load(open(os.path.join(out, "_fidelity-report.json"), encoding="utf-8"))
    assert any(e["stage"] == "parse" for e in rep["errors"])
