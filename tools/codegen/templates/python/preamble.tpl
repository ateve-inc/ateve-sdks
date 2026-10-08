"""Pydantic request and response models for ``POST /v1/search``."""

from __future__ import annotations

import re
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ResponseModel(BaseModel):
    model_config = ConfigDict(extra="allow", frozen=True)


_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _parse_date(value: str) -> date:
    if not _DATE.fullmatch(value):
        raise ValueError("date_range contains an invalid date shape")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"date_range contains an invalid calendar date: {value}") from exc


def _validate_date_range(value: Optional[str]) -> Optional[str]:
    if value is None or value == "" or value in {"day", "week", "month", "year"}:
        return value
    if ".." not in value:
        _parse_date(value)
        return value
    if value.count("..") != 1:
        raise ValueError("date_range must contain at most one '..' separator")
    start_text, end_text = value.split("..")
    if not start_text and not end_text:
        raise ValueError("date_range cannot be '..'")
    start = _parse_date(start_text) if start_text else None
    end = _parse_date(end_text) if end_text else None
    if start is not None and end is not None and end < start:
        raise ValueError("date_range end date must be on or after the start date")
    return value
