from sqlalchemy.dialects.mysql import DATETIME as MYSQL_DATETIME

from portal.extensions import db

# MySQL stores DATETIME/TIMESTAMP to the second unless told otherwise, which
# makes two records written in the same second indistinguishable. Anything
# that has to be *ordered* within a second -- a conversation turn, a
# consultation's own timestamps -- uses this instead.
PRECISE_DATETIME = db.DateTime().with_variant(MYSQL_DATETIME(fsp=6), "mysql")
PRECISE_TIMESTAMP = db.TIMESTAMP().with_variant(MYSQL_DATETIME(fsp=6), "mysql")
