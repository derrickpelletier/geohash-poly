TESTS = test/*.js
REPORTER = spec

test:
	@NODE_ENV=test node \
		$(TESTS)

.PHONY: test