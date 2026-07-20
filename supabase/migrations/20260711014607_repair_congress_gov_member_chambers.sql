-- Repair historical Congress.gov rows produced by the old importer, which
-- selected the first chamber in a member's full career instead of the chamber
-- for this Congress. Congress.gov's Congress-scoped list represents senators
-- with a null district and House members with a numeric district (including 0
-- for at-large districts).

UPDATE public.member_congress_terms
SET chamber = CASE
  WHEN district IS NULL THEN 'senate'
  ELSE 'house'
END
WHERE source = 'congress_gov'
  AND chamber IS DISTINCT FROM CASE
    WHEN district IS NULL THEN 'senate'
    ELSE 'house'
  END;
