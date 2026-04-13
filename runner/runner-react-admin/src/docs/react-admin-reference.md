## React Admin 5 CRUD Reference

### App with Resources

```tsx
import { Admin, Resource } from 'react-admin';
import { dataProvider } from './dataProvider';
import { authProvider } from './authProvider';
import { PostList, PostCreate, PostEdit, PostShow } from './posts';
import { CommentList, CommentCreate, CommentEdit, CommentShow } from './comments';

const App = () => (
  <Admin dataProvider={dataProvider} authProvider={authProvider}>
    <Resource name="posts" list={PostList} create={PostCreate} edit={PostEdit} show={PostShow} />
    <Resource name="comments" list={CommentList} create={CommentCreate} edit={CommentEdit} show={CommentShow} />
  </Admin>
);
```

### List with DataTable

```tsx
import { List, DataTable, DateField, EditButton } from 'react-admin';

export const PostList = () => (
  <List>
    <DataTable>
      <DataTable.Col source="id" />
      <DataTable.Col source="title" />
      <DataTable.Col source="published_at" field={DateField} />
      <DataTable.Col source="views" />
      <DataTable.Col><EditButton /></DataTable.Col>
    </DataTable>
  </List>
);
```

### Edit Form

```tsx
import { Edit, SimpleForm, TextInput, DateInput, BooleanInput } from 'react-admin';

export const PostEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput disabled source="id" />
      <TextInput source="title" />
      <TextInput multiline source="body" />
      <DateInput source="published_at" />
      <BooleanInput source="published" />
    </SimpleForm>
  </Edit>
);
```

### Create Form

```tsx
import { Create, SimpleForm, TextInput } from 'react-admin';

export const PostCreate = () => (
  <Create>
    <SimpleForm>
      <TextInput source="title" />
      <TextInput multiline source="body" />
    </SimpleForm>
  </Create>
);
```

### Show View

```tsx
import { Show, SimpleShowLayout, TextField, DateField } from 'react-admin';

export const PostShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="title" />
      <TextField source="body" />
      <DateField source="published_at" />
    </SimpleShowLayout>
  </Show>
);
```

### ReferenceField and ReferenceInput

```tsx
// In List — show related record name
<ReferenceField source="company_id" reference="companies" />

// In Edit/Create — select related record
<ReferenceInput source="company_id" reference="companies" />
```

### Field type mapping
- String → TextField / TextInput
- Int/Float → NumberField / NumberInput
- Boolean → BooleanField / BooleanInput
- DateTime → DateField / DateInput
- Enum → SelectField / SelectInput with choices
- Relation (FK) → ReferenceField / ReferenceInput
