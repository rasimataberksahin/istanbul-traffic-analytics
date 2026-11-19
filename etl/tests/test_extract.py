import io
import json
import urllib.error

import pytest

from traffic_etl import extract


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def catalog_response(name: str) -> FakeResponse:
    body = {
        "success": True,
        "result": {"resources": [{"id": "r1", "name": name, "url": f"https://example.test/{name}", "size": 10}]},
    }
    return FakeResponse(json.dumps(body).encode())


def server_error() -> urllib.error.HTTPError:
    return urllib.error.HTTPError(extract.CATALOG_URL, 500, "INTERNAL SERVER ERROR", None, None)


def test_catalog_request_is_retried_after_a_server_error(monkeypatch):
    responses = [server_error(), catalog_response("traffic_density_202408.csv")]

    def fake_open(url):
        item = responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(extract, "open_url", fake_open)
    monkeypatch.setattr(extract.time, "sleep", lambda seconds: None)

    resource = extract.find_resource("202408")

    assert resource.url.endswith("traffic_density_202408.csv")
    assert responses == []


def test_catalog_request_gives_up_after_the_last_attempt(monkeypatch):
    def always_fail(url):
        raise server_error()

    monkeypatch.setattr(extract, "open_url", always_fail)
    monkeypatch.setattr(extract.time, "sleep", lambda seconds: None)

    with pytest.raises(urllib.error.HTTPError):
        extract.find_resource("202408")
