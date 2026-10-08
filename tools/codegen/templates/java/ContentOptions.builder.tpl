        public ContentOptions build() {
            if (maxCharacters != null && maxCharacters < {{max_characters.minimum}}) {
                throw new IllegalArgumentException("maxCharacters must be positive");
            }
            return new ContentOptions(this);
        }
